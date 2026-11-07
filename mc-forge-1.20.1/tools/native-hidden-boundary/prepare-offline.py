from pathlib import Path
import urllib.request,json,zipfile,io,hashlib,struct,subprocess,tempfile
repo=Path(__file__).resolve().parents[3]
root=Path(tempfile.mkdtemp(prefix='native-hidden-offline-',dir=repo/'output/eff-local-native-20261104'))
def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'EFF-offline-native-boundary-research'}),timeout=60).read()
ref=json.loads(fetch('https://api.github.com/repos/TsudaKageyu/minhook/git/ref/tags/v1.3.4'))
commit=ref['object']['sha']
if ref['object']['type']=='tag':commit=json.loads(fetch(ref['object']['url']))['object']['sha']
if commit!='c3fcafdc10146beb5919319d0683e44e3c30d537':raise ValueError('UPSTREAM_TAG_CHANGED')
archive=fetch('https://codeload.github.com/TsudaKageyu/minhook/zip/'+commit)
if hashlib.sha256(archive).hexdigest()!='cdcb160f734d81bd4d235dfea79e3f5a661c8ef0ab74fa814272aa5449069034':raise ValueError('UPSTREAM_ARCHIVE_CHANGED')
(root/'minhook-source.zip').write_bytes(archive)
with zipfile.ZipFile(io.BytesIO(archive)) as z:
    for member in z.namelist():
        relative=Path(*Path(member).parts[1:])
        if member.endswith('/') or not relative.parts:continue
        if relative.parts[0] not in ('include','src') and str(relative)!='LICENSE.txt':continue
        if '..' in relative.parts:raise ValueError('UNSAFE_ARCHIVE_PATH')
        path=root/'minhook'/relative;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(z.read(member))
jdk=repo.parent/'output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1'
jvm=jdk/'bin/server/jvm.dll';data=jvm.read_bytes();sha=hashlib.sha256(data).hexdigest()
if sha!='6b9a2354b41134986d61d1f8ff0f9614e3a6b7e235469b7e9260fe7a1d9bb84a':raise ValueError('JVM_REAUDIT_REQUIRED')
pe=struct.unpack_from('<I',data,0x3c)[0];opt=pe+24;base=struct.unpack_from('<Q',data,opt+24)[0];sections=[]
for i in range(struct.unpack_from('<H',data,pe+6)[0]):
    off=opt+struct.unpack_from('<H',data,pe+20)[0]+40*i
    vs,va,rs,rp=struct.unpack_from('<IIII',data,off+8);sections.append((va,max(vs,rs),rp))
def offset(rva):
    for va,size,raw in sections:
        if va<=rva<va+size:return raw+rva-va
    raise ValueError(rva)
def string(rva):
    off=offset(rva);return data[off:data.index(b'\0',off)].decode()
exp=offset(struct.unpack_from('<I',data,opt+112)[0]);n,func,names,ords=struct.unpack_from('<IIII',data,exp+24);rva=None
for i in range(n):
    name=string(struct.unpack_from('<I',data,offset(names)+4*i)[0])
    if name=='JVM_LookupDefineClass':rva=struct.unpack_from('<I',data,offset(func)+4*struct.unpack_from('<H',data,offset(ords)+2*i)[0])[0]
if rva is None:raise ValueError('EXPORT_ABSENT')
prologue=data[offset(rva):offset(rva)+32]
(root/'pins.h').write_text('#define JVM_SHA256 "'+sha+'"\n#define JVM_EXPORT_RVA '+hex(rva)+'\nstatic const unsigned char JVM_PROLOGUE[] = {'+','.join(hex(x) for x in prologue)+'};\n')
receipt={'root':str(root),'jdk':str(jdk),'jvmPath':str(jvm),'jvmSha256':sha,'jvmExportRva':hex(rva),'jvmPrologue':prologue.hex(),'minhookCommit':commit,'minhookUrl':'https://github.com/TsudaKageyu/minhook/tree/'+commit,'minhookArchiveSha256':hashlib.sha256(archive).hexdigest(),'source':'official upstream v1.3.4; no installation'}
(root/'preparation.json').write_text(json.dumps(receipt,indent=2))
result=subprocess.run(['C:/msys64/mingw64/bin/objdump.exe','-d','-Mintel','--start-address='+hex(base+rva),'--stop-address='+hex(base+rva+160),str(jvm)],capture_output=True)
(root/'jvm-export-prologue.asm.txt').write_bytes(result.stdout+result.stderr)
print(json.dumps(receipt,indent=2))
