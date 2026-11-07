from pathlib import Path
import subprocess,os,tempfile,json,hashlib
source=Path(__file__).resolve().parent
repo=source.parents[3]
jdk=repo.parent/'output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1'
compiler=Path('C:/msys64/mingw64/bin')
out=Path(tempfile.mkdtemp(prefix='instrumentation-abi-fixture-',dir=repo/'output/eff-local-native-20261104'))
env=os.environ.copy();env['PATH']=str(compiler)+os.pathsep+env.get('PATH','')
log=out/'test.log'
def run(command):
 result=subprocess.run([str(x) for x in command],env=env,cwd=out,capture_output=True,timeout=90)
 with log.open('ab') as f:f.write(('COMMAND '+str(command)+'\n').encode()+result.stdout+result.stderr)
 if result.returncode:raise RuntimeError(f'failed {result.returncode}; see {log}')
 return result.stdout.decode(errors='replace')
dll=out/'abi-fixture.dll'
run([compiler/'g++.exe','-std=c++17','-O2','-shared','-static','-static-libgcc','-static-libstdc++',source/'fixture.cpp','-I'+str(jdk/'include'),'-I'+str(jdk/'include/win32'),'-o',dll])
run([jdk/'bin/javac.exe','--release','17','-d',out,source/'AbiFixture.java'])
# -Xcheck:jni is intentionally not used for the malformed fixture call: the
# adapter must run before the JNI type checker consumes the undersupplied ABI.
result=run([jdk/'bin/java.exe','-Xverify:all','-XX:ErrorFile='+str(out/'hs_err_pid%p.log'),'-cp',out,'AbiFixture',dll])
if 'ABI_FIXTURE_PASS' not in result:raise RuntimeError('missing completion')
receipt={'result':result.strip(),'scope':'self-generated JNI and Java fixture only; no MC/sample execution','dll':str(dll),'sha256':hashlib.sha256(dll.read_bytes()).hexdigest(),'sources':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [source/'fixture.cpp',source/'AbiFixture.java',source.parent/'native/instrumentation-abi.h']},'log':str(log)}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt,indent=2))
