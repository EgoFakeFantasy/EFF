"""Render read-only JVMTI snapshots with javap; never define or execute the class.

The reconstructed file is an analysis container, not a runnable class: stack maps,
handlers, original flags and bootstrap-method attributes are not captured by this
probe. Consequently output is evidence about recorded instructions only.
"""
import hashlib
import json
import re
import struct
import subprocess
import sys
from pathlib import Path


def analysis_class(sample):
    if sample.get('methodsError') != 0 or sample.get('poolError') != 0:
        raise ValueError('METHOD_OR_POOL_UNAVAILABLE')
    count = sample['poolEntries']
    pool = bytes.fromhex(sample['poolHex'])
    if not 1 <= count <= 65535 or len(pool) != sample['poolLength'] or len(pool) > 524288:
        raise ValueError('POOL_BOUNDS')
    entries = bytearray(pool)

    def add(raw):
        nonlocal count
        index = count
        count += 1
        if count > 65535:
            raise ValueError('POOL_FULL')
        entries.extend(raw)
        return index

    def utf(text):
        # Added names are the probe's fixed ASCII signatures, never arbitrary MUTF8.
        raw = text.encode('ascii')
        return add(b'\x01' + struct.pack('>H', len(raw)) + raw)

    sig = sample['classSignature']
    if not re.fullmatch(r'Lnet/minecraft/[A-Za-z/]+;', sig):
        raise ValueError('CLASS_SIGNATURE')
    this_class = add(b'\x07' + struct.pack('>H', utf(sig[1:-1])))
    parent = add(b'\x07' + struct.pack('>H', utf('java/lang/Object')))
    code_name = utf('Code')
    methods = []
    for method in sample['methods']:
        if method.get('bytecodeError') != 0 or 'bytecodeHex' not in method:
            raise ValueError('BYTECODE_UNAVAILABLE')
        admitted = {
            'Lnet/minecraft/server/network/ServerGamePacketListenerImpl;': {('m_9933_', '()V')},
            'Lnet/minecraft/server/level/ServerPlayer;': {('m_8119_', '()V'), ('m_9240_', '()V')},
            'Lnet/minecraft/client/player/LocalPlayer;': {('m_8119_', '()V')},
            'Lnet/minecraft/server/level/ServerLevel;': {
                ('m_8647_', '(Lnet/minecraft/world/entity/Entity;)V'),
                ('m_184063_', '(Lnet/minecraft/util/profiling/ProfilerFiller;Lnet/minecraft/world/entity/Entity;)V')},
        }
        if (method['name'], method['descriptor']) not in admitted.get(sig, set()):
            raise ValueError('METHOD_SIGNATURE')
        code = bytes.fromhex(method['bytecodeHex'])
        if len(code) != method['length'] or not 1 <= len(code) <= 65535:
            raise ValueError('BYTECODE_BOUNDS')
        body = struct.pack('>HHI', 65535, 65535, len(code)) + code + b'\0\0\0\0'
        methods.append(struct.pack('>HHHHHI', 1, utf(method['name']), utf(method['descriptor']), 1, code_name, len(body)) + body)
    if not methods:
        raise ValueError('NO_SELECTED_METHODS')
    return (struct.pack('>IHHH', 0xCAFEBABE, 0, 61, count) + entries
            + struct.pack('>HHHHHH', 1, this_class, parent, 0, 0, len(methods))
            + b''.join(methods) + b'\0\0')


def main():
    source, destination, javap = map(Path, sys.argv[1:4])
    data = json.loads(source.read_text(encoding='utf-8'))
    group = data.get('liveTickAudit')
    samples = [v for v in group.values() if isinstance(v, dict) and 'classSignature' in v] if group else [data]
    if not samples:
        raise ValueError('NO_LIVE_SNAPSHOTS')
    destination.mkdir(parents=True, exist_ok=False)
    receipt = {'source': str(source.resolve()), 'sourceSHA256': hashlib.sha256(source.read_bytes()).hexdigest(),
               'readOnly': True, 'executionProven': False, 'atomicSnapshot': False, 'methods': []}
    for sample in samples:
        name = sample['classSignature'][1:-1].rsplit('/', 1)[-1]
        artifact = destination / (name + '.analysis.class')
        artifact.write_bytes(analysis_class(sample))
        result = subprocess.run([str(javap), '-c', '-p', str(artifact)], capture_output=True, timeout=30)
        (destination / (name + '.javap.txt')).write_bytes(result.stdout + result.stderr)
        if result.returncode:
            raise RuntimeError('JAVAP_REJECTED_ANALYSIS_CONTAINER')
        receipt['methods'].extend({'class': sample['classSignature'], 'method': m['name'], 'descriptor': m['descriptor'],
            'bytecodeSHA256': hashlib.sha256(bytes.fromhex(m['bytecodeHex'])).hexdigest(),
            'length': m['length']} for m in sample['methods'])
    (destination / 'receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
