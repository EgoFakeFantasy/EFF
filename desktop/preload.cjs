"use strict";
const {contextBridge,ipcRenderer}=require('electron');
const bootstrap=ipcRenderer.sendSync('eff:bootstrap');
contextBridge.exposeInMainWorld('effDesktop',Object.freeze({
 version:'0.2.0',bootstrap,
 persist:entries=>ipcRenderer.invoke('eff:persist',entries),
 exportSave:()=>ipcRenderer.invoke('eff:export'),
 importSave:profile=>ipcRenderer.invoke('eff:import',profile),
 modelConfigure:config=>ipcRenderer.invoke('eff:model-configure',config),
 modelPropose:request=>ipcRenderer.invoke('eff:model-propose',request),
 modelCancel:()=>ipcRenderer.invoke('eff:model-cancel'),
 quit:()=>ipcRenderer.invoke('eff:quit')
}));
