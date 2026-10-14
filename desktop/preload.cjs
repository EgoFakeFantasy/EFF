"use strict";
const {contextBridge,ipcRenderer}=require('electron');
const bootstrap=ipcRenderer.sendSync('eff:bootstrap');
contextBridge.exposeInMainWorld('effDesktop',Object.freeze({
 version:'0.6.0',bootstrap,
 worldCommand:request=>ipcRenderer.invoke('eff:world',request),
 persist:entries=>ipcRenderer.invoke('eff:persist',entries),
 exportSave:()=>ipcRenderer.invoke('eff:export'),
 importSave:profile=>ipcRenderer.invoke('eff:import',profile),
 modelStatus:()=>ipcRenderer.invoke('eff:model-status'),
 modelPlan:request=>ipcRenderer.invoke('eff:model-plan',request),
 modelConfigure:config=>ipcRenderer.invoke('eff:model-configure',config),
 modelPropose:request=>ipcRenderer.invoke('eff:model-propose',request),
 modelCancel:()=>ipcRenderer.invoke('eff:model-cancel'),
 quit:()=>ipcRenderer.invoke('eff:quit')
}));
