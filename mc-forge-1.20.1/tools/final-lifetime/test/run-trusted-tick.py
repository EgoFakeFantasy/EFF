from pathlib import Path
import tempfile,subprocess,zipfile,hashlib,json
repo=Path(__file__).resolve().parents[4]
root=Path(tempfile.mkdtemp(prefix='trusted-tick-offline-',dir=repo/'output/eff-local-native-20261104'))
jdk=repo.parent/'output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1/bin'
libs=repo/'output/eff-local-native-20261104/forge-client/libraries'
asm=[str(next(libs.rglob(n))) for n in ['asm-9.9.1.jar','asm-tree-9.9.1.jar']]
sources={
'net/minecraft/server/level/ServerPlayer.java':'''package net.minecraft.server.level; public class ServerPlayer {public boolean owned; public int ticks; public void m_9240_(){ticks++;} public void fakeTick(){throw new AssertionError("corrupted tick reached");}}''',
'net/minecraft/server/network/ServerGamePacketListenerImpl.java':'''package net.minecraft.server.network; public class ServerGamePacketListenerImpl {public net.minecraft.server.level.ServerPlayer f_9743_=new net.minecraft.server.level.ServerPlayer();public int keepAlives,foreignCalls; public void m_9933_(){f_9743_.m_9240_();keepAlives++;if(keepAlives<0)throw new IllegalStateException("normal failure");}}''',
'eff/lifetime/FieldWriteGate.java':'''package eff.lifetime; public class FieldWriteGate {public static boolean fail; public static boolean rejectQuery(Object p){if(fail)throw new IllegalStateException("ownership unavailable");return p instanceof net.minecraft.server.level.ServerPlayer v&&v.owned;}}'''
}
for name,source in sources.items():
 p=root/'src'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(source,encoding='utf8')
def run(args):
 r=subprocess.run([str(x) for x in args],capture_output=True,text=True,timeout=60)
 with (root/'test.log').open('a',encoding='utf8') as f:f.write(r.stdout+r.stderr)
 print(r.stdout+r.stderr,end='')
 if r.returncode:raise SystemExit(r.returncode)
run([jdk/'javac.exe','-d',root/'fixtures',*list((root/'src').rglob('*.java'))])
java=repo/'mc-forge-1.20.1/tools/final-lifetime/src/eff/finalgate/TrustedTickTransform.java'
run([jdk/'javac.exe','-cp',';'.join(asm),'-d',root/'classes',java,Path(__file__).with_name('TrustedTickTest.java')])
jar=libs/'net/minecraftforge/forge/1.20.1-47.4.20/forge-1.20.1-47.4.20-client.jar'
with zipfile.ZipFile(jar) as z:template=z.read('net/minecraft/server/network/ServerGamePacketListenerImpl.class')
digest=hashlib.sha256(template).hexdigest()
if digest!='8bcf74fa649eeec89b4f22726da82f64db2d7e6dbc05e96e300e349daca04649':raise RuntimeError('FORGE_TEMPLATE_PIN')
resource=root/'classes/eff-owned/forge-47.4.20-connection-template.class';resource.parent.mkdir(parents=True);resource.write_bytes(template)
run([jdk/'java.exe','-Xverify:all','-Xmx192m','-cp',';'.join([str(root/'classes'),*asm]),'eff.finalgate.TrustedTickTest',root/'fixtures',jar,root/'actual-guarded-connection.class'])
bad=bytearray(template);bad[-1]^=1
(root/'tampered-template-negative-control.class').write_bytes(bad)
try:
 resource.write_bytes(bad)
 run([jdk/'java.exe','-Xverify:all','-Xmx192m','-cp',';'.join([str(root/'classes'),*asm]),'eff.finalgate.TrustedTickTest','--pin-negative'])
finally:resource.write_bytes(template)
(root/'receipt.json').write_text(json.dumps({'sourceSHA256':hashlib.sha256(java.read_bytes()).hexdigest(),'templateSHA256':digest,'output':str(root),'mcExecuted':False,'opponentExecuted':False,'passed':True},indent=2),encoding='utf8')
print('EVIDENCE',root)
