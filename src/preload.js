// Bridge between the sandboxed UI and the main process.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('cdj', {
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    update: (id, patch) => ipcRenderer.invoke('library:update', id, patch),
    remove: (id, opts) => ipcRenderer.invoke('library:remove', id, opts),
    readAudio: (id) => ipcRenderer.invoke('library:readAudio', id),
    importDialog: () => ipcRenderer.invoke('library:importDialog'),
    importFiles: (files) =>
      ipcRenderer.invoke(
        'library:importPaths',
        Array.from(files).map((f) => webUtils.getPathForFile(f)).filter(Boolean),
      ),
    openFolder: () => ipcRenderer.invoke('library:openFolder'),
  },
  cc: {
    search: (query) => ipcRenderer.invoke('cc:search', query),
    download: (url, jobId) => ipcRenderer.invoke('cc:download', url, jobId),
    cancel: (jobId) => ipcRenderer.invoke('cc:cancel', jobId),
    onProgress: (fn) => {
      const handler = (_e, payload) => fn(payload);
      ipcRenderer.on('download:progress', handler);
      return () => ipcRenderer.removeListener('download:progress', handler);
    },
  },
  ytdlp: {
    status: () => ipcRenderer.invoke('ytdlp:status'),
    update: () => ipcRenderer.invoke('ytdlp:update'),
  },
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
