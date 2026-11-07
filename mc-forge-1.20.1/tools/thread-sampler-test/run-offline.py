from pathlib import Path
import subprocess, tempfile
repo=Path(__file__).resolve().parents[3]
out=Path(tempfile.mkdtemp(prefix='thread-sampler-',dir=repo/'output/eff-local-native-20261104'))
jdk=repo.parent/'output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1/bin'
gson=next((repo/'output/eff-local-native-20261104/forge-client/libraries').rglob('gson-2.10.1.jar'))
def run(command):
    result=subprocess.run(list(map(str,command)),capture_output=True,text=True,timeout=30)
    print(result.stdout,end='');print(result.stderr,end='')
    with (out/'test.log').open('a',encoding='utf8') as log: log.write(result.stdout+result.stderr)
    if result.returncode: raise SystemExit(result.returncode)
run([jdk/'javac.exe','-cp',gson,'-d',out,
    repo/'mc-1.20.1/src/main/java/eff/minecraft/lab/LabThreadSampler.java',
    Path(__file__).with_name('LabThreadSamplerTest.java')])
for mode,prop in [('disabled','eff.entityGuardSelftest=false'),('baseline','eff.entityGuardSelftest=true'),
                  ('pig-lab','eff.pig2Lab=true'),('sword-lab','eff.foreverLoveLab=true'),
                  ('manual-unarmed','eff.manualCombat=synthetic'),('manual-player','eff.manualCombat=synthetic')]:
    print('MODE',mode)
    extra=['-Deff.manualPlayerAttackItem=synthetic:probe'] if mode=='manual-player' else []
    run([jdk/'java.exe','-Xverify:all','-D'+prop,*extra,'-cp',str(out)+';'+str(gson),
        'eff.minecraft.lab.LabThreadSamplerTest',out/('proof-'+mode)])
run([jdk/'java.exe','-Xverify:all','-Deff.entityGuardSelftest=true','-cp',str(out)+';'+str(gson),
     'eff.minecraft.lab.LabThreadSamplerTest',out/'proof-prepare-failure','prepare-failure'])
print('EVIDENCE',out)
