from pathlib import Path
import subprocess, tempfile
repo=Path(__file__).resolve().parents[3]
libs=repo/'output/eff-local-native-20261104/forge-client/libraries'
patterns=['asm-9.9.1.jar','asm-tree-9.9.1.jar','asm-commons-9.9.1.jar','modlauncher-*.jar','gson-2.10.1.jar','fastutil-8.5.9.jar']
jars=[]
for pattern in patterns:
    found=sorted(libs.rglob(pattern))
    if not found: raise SystemExit('Missing dependency: '+pattern)
    jars.append(found[0])
jdk=repo.parent/'output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1/bin'
out=Path(tempfile.mkdtemp(prefix='lifetime-trace-',dir=repo/'output/eff-local-native-20261104'))
base=Path(__file__).resolve().parent
sources=[repo/'mc-1.20.1/src/main/java/eff/minecraft/lab/AttackTraceBridge.java',
 repo/'mc-forge-1.20.1/tools/final-lifetime/src/eff/finalgate/FinalLifetimeTransform.java',
 repo/'mc-forge-1.20.1/tools/final-lifetime/src/eff/finalgate/TrustedTickTransform.java',
 *(repo/'mc-forge-1.20.1/src/lifetimeGate/java/eff/lifetime'/name for name in ['FieldWriteGate.java','LifetimeTarget.java','LifetimeContainer.java','LifetimeRenderer.java','PlayerOperationTransform.java']),
 repo/'mc-forge-1.20.1/tools/native-hidden-boundary/src/eff/hiddenboundary/HiddenWriteTransform.java',
 *list((base/'fixtures').rglob('*.java')),base/'ForeverUtils.java',base/'LifetimeTraceTest.java']
cp=';'.join(map(str,jars))
def run(command):
    result=subprocess.run(list(map(str,command)),capture_output=True,text=True)
    print(result.stdout,end='');print(result.stderr,end='')
    with (out/'test.log').open('a',encoding='utf8') as log: log.write(result.stdout+result.stderr)
    if result.returncode: raise SystemExit(result.returncode)
run([jdk/'javac.exe','-cp',cp,'-d',out,*sources])
for enabled in ['false','true']:
    run([jdk/'java.exe','-Xverify:all','-Deff.labAttackTrace='+enabled,'-cp',str(out)+';'+cp,'LifetimeTraceTest'])
print('EVIDENCE',out)
