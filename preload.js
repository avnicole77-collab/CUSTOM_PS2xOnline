'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bossAPI', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  createOwner: (payload) => ipcRenderer.invoke('auth:create-owner', payload),
  login: (payload) => ipcRenderer.invoke('auth:login', payload),
  logout: () => ipcRenderer.invoke('auth:logout'),
  changePassword: (payload) => ipcRenderer.invoke('auth:change-password', payload),
  listUsers: () => ipcRenderer.invoke('users:list'),
  createUser: (payload) => ipcRenderer.invoke('users:create', payload),
  updateUser: (payload) => ipcRenderer.invoke('users:update', payload),
  backupData: () => ipcRenderer.invoke('data:backup'),
  restoreData: () => ipcRenderer.invoke('data:restore'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  listModels: (provider) => ipcRenderer.invoke('providers:list-models', provider),
  getNote: () => ipcRenderer.invoke('notes:get'),
  saveNote: (content) => ipcRenderer.invoke('notes:save', { content }),
  copyText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  openCodeFolder: () => ipcRenderer.invoke('code:open-folder'),
  readCodeFile: (filePath) => ipcRenderer.invoke('code:read-file', filePath),
  searchCode: (query) => ipcRenderer.invoke('code:search', query),
  writeCodeFile: (payload) => ipcRenderer.invoke('code:write-file', payload),
  listRooms: () => ipcRenderer.invoke('rooms:list'),
  createRoom: (payload) => ipcRenderer.invoke('rooms:create', payload),
  updateRoom: (payload) => ipcRenderer.invoke('rooms:update', payload),
  deleteRoom: (id) => ipcRenderer.invoke('rooms:delete', id),
  listMessages: (roomId) => ipcRenderer.invoke('messages:list', roomId),
  sendChat: (payload) => ipcRenderer.invoke('chat:send', payload),
  stopChat: () => ipcRenderer.invoke('chat:stop'),
  onChatDelta: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('chat:stream-delta', listener);
    return () => ipcRenderer.removeListener('chat:stream-delta', listener);
  },
  selectFiles: () => ipcRenderer.invoke('files:select'),
  importBatch: (payload) => ipcRenderer.invoke('batch:import', payload),
  listJobs: () => ipcRenderer.invoke('batch:list'),
  startBatch: (jobId) => ipcRenderer.invoke('batch:start', jobId),
  pauseBatch: (jobId) => ipcRenderer.invoke('batch:pause', jobId),
  cancelBatch: (jobId) => ipcRenderer.invoke('batch:cancel', jobId),
  retryFailedBatch: (jobId) => ipcRenderer.invoke('batch:retry-failed', jobId),
  exportBatch: (jobId) => ipcRenderer.invoke('batch:export', jobId),
  onBatchUpdated: (callback) => {
    const listener = (_, job) => callback(job);
    ipcRenderer.on('batch:updated', listener);
    return () => ipcRenderer.removeListener('batch:updated', listener);
  }
});
