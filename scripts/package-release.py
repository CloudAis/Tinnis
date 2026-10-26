"""Package the exact browser-tested candidate without rebuilding or downloading anything."""
from pathlib import Path
from hashlib import sha256
import json
import zipfile

root=Path(__file__).resolve().parents[1]
dist=root/'dist'
artifacts=root/'artifacts'
report=json.loads((artifacts/'soak-report.json').read_text())
files=sorted(p for p in dist.rglob('*') if p.is_file())
h=sha256()
for p in files:
    h.update(p.relative_to(dist).as_posix().encode())
    h.update(p.read_bytes())
assert report['acceptance'] and report['elapsedSeconds']>=1800, '30-minute candidate acceptance is incomplete'
assert report['buildHash']==h.hexdigest(), 'dist differs from the tested candidate; run acceptance again'
assert not report['errors'], 'candidate has recorded browser errors'
artifacts.mkdir(exist_ok=True)
version=json.loads((root/'package.json').read_text())['version']
runtime=artifacts/f'沿线小镇-v{version}.zip'
source=artifacts/f'沿线小镇-v{version}-源码.zip'
with zipfile.ZipFile(runtime,'w',zipfile.ZIP_DEFLATED,9) as z:
    for p in files:z.write(p,'沿线小镇/'+p.relative_to(dist).as_posix())
    for name in ['README.md','VALIDATION.md','KNOWN_ISSUES.md','THIRD_PARTY_NOTICES.md']:
        z.write(root/name,name)
    z.write(artifacts/'default-config.json','默认配置参考.json')
    for name in ['soak-report.json','balance-report.json','release-browser-report.json']:
        z.write(artifacts/name,'验证记录/'+name)
    z.writestr('启动说明.txt','解压后，在“沿线小镇”目录运行 python3 -m http.server 8080\n打开 http://localhost:8080\n无需安装 Node 依赖，断开互联网也可启动。不要直接双击 index.html。\n首次点击启用声音；存档面板可导入/导出与恢复。详细操作、存档限制和验证范围见 README.md、VALIDATION.md、KNOWN_ISSUES.md。\n默认配置参考文件供查阅；修改游戏默认参数须在源码 src/config.ts 修改并重新构建。\n')
source_paths=[]
for folder in ['src','tests','scripts','public']:
    if (root/folder).exists():source_paths.extend(p for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
for pattern in ['*.md','*.json','*.js','*.ts','*.html','.gitignore','.nvmrc','.npmrc']:
    source_paths.extend(root.glob(pattern))
with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED,9) as z:
    for p in sorted(set(source_paths)):
        if p.is_file():z.write(p,'沿线小镇源码/'+p.relative_to(root).as_posix())
for archive in [runtime,source]:
    with zipfile.ZipFile(archive) as z:assert z.testzip() is None
with zipfile.ZipFile(runtime) as z:
    for p in files:assert z.read('沿线小镇/'+p.relative_to(dist).as_posix())==p.read_bytes()
manifest={'version':version,'buildHash':h.hexdigest(),'soakSeconds':report['elapsedSeconds'],'archives':{p.name:{'bytes':p.stat().st_size,'sha256':sha256(p.read_bytes()).hexdigest()} for p in [runtime,source]}}
(artifacts/'release-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
