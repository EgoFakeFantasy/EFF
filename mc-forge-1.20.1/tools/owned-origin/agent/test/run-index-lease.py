from pathlib import Path
import subprocess,tempfile
repo=Path(__file__).resolve().parents[5]
base=Path(__file__).resolve().parent
jdk=repo.parent/'output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1/bin'
out=Path(tempfile.mkdtemp(prefix='index-lease-policy-',dir=repo/'output/eff-local-native-20261104'))
gate=repo/'mc-forge-1.20.1/build/runtime/eff-lifetime-gate.jar'
fastutil=next((repo/'output/eff-local-native-20261104/forge-client/libraries').rglob('fastutil-8.5.9.jar'))
def run(args):
 r=subprocess.run(list(map(str,args)),capture_output=True,text=True);print(r.stdout+r.stderr)
 with (out/'test.log').open('a',encoding='utf8') as log:log.write(r.stdout+r.stderr)
 if r.returncode:raise SystemExit(r.returncode)
run([jdk/'javac.exe','-d',out/'boot',base.parent/'bootstrap/eff/ownedboot/InstanceWriteGuard.java'])
run([jdk/'javac.exe','-cp',str(out/'boot')+';'+str(fastutil)+';'+str(gate),'-d',out/'test',*list((base/'index-lease-fixture').rglob('*.java'))])
run([jdk/'java.exe','-Xverify:all','-Xbootclasspath/a:'+str(out/'boot'),'-cp',str(out/'test')+';'+str(fastutil)+';'+str(gate),'proof.IndexLeasePolicyTest'])
print('EVIDENCE',out)
