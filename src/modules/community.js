export class CommunityManager {
    constructor(app) {
        this.app = app
    }

    addSource() {
        console.log('Community Feature: addSource (Disabled)')
    }

    renderSourceUI() {
        console.log('Community Feature: renderSourceUI (Disabled)')
    }

    verifyPermission(fileHandle, readWrite) {
        console.log('Community Feature: verifyPermission (Disabled)')
        return true
    }

    connectSyncFolder(type) {
        console.log('Community Feature: connectSyncFolder (Disabled)')
    }

    publishWork(target) {
        console.log('Community Feature: publishWork (Disabled)')
    }

    renderCommunityHub() {
        console.log('Community Feature: renderCommunityHub (Disabled)')
    }

    importSharedWork(work) {
        console.log('Community Feature: importSharedWork (Disabled)')
    }
}
