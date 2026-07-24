'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bossAPI', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  createOwner: (payload) => ipcRenderer.invoke('auth:create-owner', payload),
  login: (payload) => ipcRenderer.invoke('auth:login', payload),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  listModels: (provider) => ipcRenderer.invoke('providers:list-models', provider),
  listRooms: () => ipcRenderer.invoke('rooms:list'),
  createRoom: (payload) => ipcRenderer.invoke('rooms:create', payload),
  updateRoom: (payload) => ipcRenderer.invoke('rooms:update', payload),
  deleteRoom: (id) => ipcRenderer.invoke('rooms:delete', id),
  listMessages: (roomId) => ipcRenderer.invoke('messages:list', roomId),
  sendChat: (payload) => ipcRenderer.invoke('chat:send', payload),
  selectFiles: () => ipcRenderer.invoke('files:select'),
  importBatch: (payload) => ipcRenderer.invoke('batch:import', payload),
  listJobs: () => ipcRenderer.invoke('batch:list'),
  startBatch: (jobId) => ipcRenderer.invoke('batch:start', jobId),
  pauseBatch: (jobId) => ipcRenderer.invoke('batch:pause', jobId),
  cancelBatch: (jobId) => ipcRenderer.invoke('batch:cancel', jobId),
  exportBatch: (jobId) => ipcRenderer.invoke('batch:export', jobId),
  onBatchUpdated: (callback) => ipcRenderer.on('batch:updated', (_, job) => callback(job))
});
