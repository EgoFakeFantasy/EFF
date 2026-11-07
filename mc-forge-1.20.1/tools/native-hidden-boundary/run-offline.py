from pathlib import Path
import subprocess,json,hashlib,sys,os,tempfile,zipfile
source=Path(__file__).resolve().parent
repo=source.parents[2]
prep=Path(sys.argv[1]).resolve()
metadata=json.loads((prep/'preparation.json').read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
if metadata['minhookCommit']!='c3fcafdc10146beb5919319d0683e44e3c30d537':raise ValueError('UNREVIEWED_MINHOOK')
if sha(prep/'minhook-source.zip')!='cdcb160f734d81bd4d235dfea79e3f5a661c8ef0ab74fa814272aa5449069034':raise ValueError('MINHOOK_ARCHIVE_CHANGED')
with zipfile.ZipFile(prep/'minhook-source.zip') as archive:
    for file in (prep/'minhook').rglob('*'):
        if file.is_file():
            name='minhook-'+metadata['minhookCommit']+'/'+file.relative_to(prep/'minhook').as_posix()
            if file.read_bytes()!=archive.read(name):raise ValueError('MINHOOK_SOURCE_CHANGED:'+name)
if sha(Path(metadata['jvmPath']))!='6b9a2354b41134986d61d1f8ff0f9614e3a6b7e235469b7e9260fe7a1d9bb84a':raise ValueError('JVM_REAUDIT_REQUIRED')
pins='#define JVM_SHA256 "'+metadata['jvmSha256']+'"\n#define JVM_EXPORT_RVA '+metadata['jvmExportRva']+'\nstatic const unsigned char JVM_PROLOGUE[] = {'+','.join(hex(x) for x in bytes.fromhex(metadata['jvmPrologue']))+'};\n'
if (prep/'pins.h').read_text()!=pins:raise ValueError('PIN_HEADER_CHANGED')
frozen={str(f.relative_to(source)):sha(f) for f in source.rglob('*') if f.is_file() and '__pycache__' not in f.parts}
root=Path(tempfile.mkdtemp(prefix='native-hidden-test-',dir=repo/'output/eff-local-native-20261104'))
jdk=Path(metadata['jdk']);mingw=Path('C:/msys64/mingw64/bin')
env=os.environ.copy();env['PATH']=str(mingw)+os.pathsep+env.get('PATH','')
log=root/'test.log'
def run(command,timeout=120):
    result=subprocess.run([str(x) for x in command],cwd=root,env=env,capture_output=True,timeout=timeout)
    with log.open('ab') as out:out.write(('COMMAND '+str(command)+'\n').encode()+result.stdout+result.stderr)
    if result.returncode:raise RuntimeError(f'FAILED {result.returncode}: {command[0]}; {log}')
    return result.stdout.decode(errors='replace')
objects=[]
for file in ['buffer.c','hook.c','trampoline.c','hde/hde64.c']:
    obj=root/(Path(file).stem+'.o');objects.append(obj)
    run([mingw/'gcc.exe','-O2','-c',prep/'minhook/src'/file,'-I'+str(prep/'minhook/include'),'-o',obj])
dll=root/'eff-hidden-boundary.dll'
fixture_dll=root/'fixture-hidden-boundary.dll'
for target,defines in [(dll,[]),(fixture_dll,['-DEFF_HIDDEN_BOUNDARY_FIXTURE_UNINSTALL'])]:
    run([mingw/'g++.exe','-std=c++17','-O2','-shared','-static','-static-libgcc','-static-libstdc++',*defines,source/'native/boundary.cpp',*objects,'-I'+str(prep),'-I'+str(prep/'minhook/include'),'-I'+str(jdk/'include'),'-I'+str(jdk/'include/win32'),'-lbcrypt','-o',target])
caller=root/'fixture-native-caller.dll'
run([mingw/'g++.exe','-std=c++17','-O2','-shared','-static','-static-libgcc','-static-libstdc++',source/'fixtures/native/test-caller.cpp','-I'+str(jdk/'include'),'-I'+str(jdk/'include/win32'),'-o',caller])
dump=subprocess.check_output([str(mingw/'objdump.exe'),'-p',str(dll)],env=env).decode(errors='replace')
imports=[line.split('DLL Name:',1)[1].strip() for line in dump.splitlines() if 'DLL Name:' in line]
if any(name.lower() not in ['bcrypt.dll','kernel32.dll','msvcrt.dll'] for name in imports):raise ValueError('UNSEALED_NATIVE_DEPENDENCY:'+str(imports))
if 'Java_eff_hiddenfixture_' in dump or 'NativeHiddenBoundary_uninstall' in dump:raise ValueError('PRODUCTION_FIXTURE_EXPORT')
(root/'native-imports.json').write_text(json.dumps(imports))
libs=repo/'output/eff-local-native-20261104/forge-client/libraries/org/ow2/asm'
asm=[libs/name/'9.9.1'/(name+'-9.9.1.jar') for name in ['asm','asm-tree']]
classes=root/'classes';classes.mkdir();cp=os.pathsep.join(str(p) for p in asm)
javafiles=sorted(source.glob('src/**/*.java'))+sorted(source.glob('fixtures/**/*.java'))
gate_source=repo/'mc-forge-1.20.1/src/lifetimeGate/java/eff/lifetime/FieldWriteGate.java'
gate_hash=sha(gate_source)
gate_text=gate_source.read_text()
gate_start=gate_text.index('  public static boolean rejectDeclaredOperation(')
gate_end=gate_text.index('\n  }',gate_start)+4
spatial_start=gate_text.index('  public static boolean rejectDeclaredSpatialValue(')
spatial_end=gate_text.index('\n  }',spatial_start)+4
fixture_gate=source/'fixtures/eff/lifetime/FieldWriteGate.java'
generated_gate=root/'FieldWriteGate.java'
generated_gate.write_text(fixture_gate.read_text().replace('  /* PRODUCTION_DECLARATION_GATE */',gate_text[gate_start:gate_end]+'\n'+gate_text[spatial_start:spatial_end]))
javafiles=[f for f in javafiles if f!=fixture_gate]+[generated_gate]
run([jdk/'bin/javac.exe','--release','17','-cp',cp,'-d',classes,*javafiles])
# Prove the final artifact does not depend on the compiler's runtime directory.
env['PATH']=os.environ.get('SystemRoot','C:/Windows')+'/System32'
output=''
for target,mode in [(fixture_dll,'fixture'),(dll,'production')]:
    output+=run([jdk/'bin/java.exe','-Xverify:all','-XX:ErrorFile='+str(root/'hs_err_pid%p.log'),'-cp',str(classes)+os.pathsep+cp,'eff.hiddenfixture.NativeBoundaryTest',target,classes/'eff/hiddenfixture/HiddenOps.class',caller,mode],timeout=90)
if frozen!={str(f.relative_to(source)):sha(f) for f in source.rglob('*') if f.is_file() and '__pycache__' not in f.parts}:raise ValueError('SOURCE_CHANGED_DURING_TEST')
if sha(Path(metadata['jvmPath']))!=metadata['jvmSha256']:raise ValueError('JVM_DISK_FILE_CHANGED')
if sha(gate_source)!=gate_hash:raise ValueError('DECLARATION_GATE_CHANGED_DURING_TEST')
receipt={'result':output.strip(),'preparation':metadata,'dllPath':str(dll),'dllSha256':sha(dll),'fixtureDllSha256':sha(fixture_dll),'nativeImports':imports,'testCallerSha256':sha(caller),'sources':frozen,'pinHeaderSha256':sha(prep/'pins.h'),'dependencies':{str(p):sha(p) for p in asm},'scope':'self-generated fixtures in separate private child JVMs for fixture and production DLLs; separate native caller uses direct JVM export; no Minecraft/sample execution; no installed binary edits','evidence':str(log)}
receipt['declarationGateSourceSHA256']=gate_hash
(root/'receipt.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps({'root':str(root),'result':output.strip()},indent=2))
