"""Build only isolated sampler/catalogue/agent fixtures; never Forge or Minecraft."""
from pathlib import Path
import hashlib, json, subprocess, tempfile, zipfile
repo=Path(__file__).resolve().parents[4]
private=repo/'output/eff-local-native-20261104'
out=Path(tempfile.mkdtemp(prefix='owned-sampler-offline-',dir=private))
jdk=repo.parent/'output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1/bin'
source=private/'video-foreverlove-v48/mc-host/mods/eff.jar'
sampler=repo/'mc-1.20.1/src/main/java/eff/minecraft/lab/LabThreadSampler.java'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
initial=sha(source)
def run(args):
    r=subprocess.run(list(map(str,args)),capture_output=True,text=True,timeout=300)
    with (out/'test.log').open('a',encoding='utf8') as log:log.write(r.stdout+r.stderr)
    if r.returncode:raise RuntimeError(r.stdout+r.stderr)
    return r.stdout
classes=out/'classes';classes.mkdir()
run([jdk/'javac.exe','-d',classes,sampler])
replacements={p.relative_to(classes).as_posix():p.read_bytes() for p in classes.rglob('*.class')}
assert set(replacements)=={'eff/minecraft/lab/LabThreadSampler.class','eff/minecraft/lab/LabThreadSampler$Probe.class','eff/minecraft/lab/LabThreadSampler$Session.class'}
candidate=out/'candidate-eff.jar'
with zipfile.ZipFile(source) as old,zipfile.ZipFile(candidate,'w',zipfile.ZIP_DEFLATED) as new:
    for info in old.infolist():new.writestr(info,replacements.get(info.filename,old.read(info)))
with zipfile.ZipFile(source) as old,zipfile.ZipFile(candidate) as new:
    assert old.namelist()==new.namelist()
    changed=[n for n in old.namelist() if old.read(n)!=new.read(n)]
    assert set(changed)<=set(replacements)
print('CANDIDATE',candidate,'changed',changed,flush=True)
catalog_stdout=run(['node',repo/'mc-forge-1.20.1/tools/owned-origin/build-and-test.cjs',candidate,sha(candidate)])
# The tool prints an initial one-line pin object followed by its full receipt.
receipt=json.loads(catalog_stdout[catalog_stdout.index('\n')+1:])
owned_receipt=Path(receipt['manifest']).with_name('receipt.json')
assert all(name.removesuffix('.class')+'=' in receipt['scope'] for name in replacements)
assert 'OWNED_SAMPLER_ORIGIN_OK' in receipt['test']
print('OWNED_RECEIPT',owned_receipt,flush=True)
agent_stdout=run(['node',repo/'mc-forge-1.20.1/tools/owned-origin/agent/build-and-test.cjs',owned_receipt])
# Agent emits several JSON lines before the receipt; locate schema-2 final object.
marker=agent_stdout.rfind('{\n  "schema": 2,')
assert marker>=0
agent=json.loads(agent_stdout[marker:])
assert 'OWNED_SAMPLER_AGENT_OK' in agent['samplerDiagnostics']['tests']
assert sha(source)==initial
summary={'source':str(source),'sourceSHA256':initial,'samplerSourceSHA256':sha(sampler),
 'candidate':str(candidate),'candidateSHA256':sha(candidate),'changedEntries':changed,
 'ownedReceipt':str(owned_receipt),'agentReceipt':str(Path(agent['agent']).with_name('receipt.json')),
 'originTest':receipt['test'],'samplerTests':agent['samplerDiagnostics']['tests'],
 'mcExecuted':False,'opponentExecuted':False,'v48DiagnosticRecovered':False}
(out/'receipt.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf8')
print(summary['samplerTests'],flush=True)
print('EVIDENCE',out,flush=True)
