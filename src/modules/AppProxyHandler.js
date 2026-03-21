/**
 * AppProxyManager defines proxy methods and getters/setters for the ScoreFlow class
 * to delegate calls to various specialized managers.
 * Extracted from main.js to comply with 500-line limit.
 */
export function applyAppProxies(app) {
    // --- ViewerManager Proxies ---
    Object.defineProperties(app, {
        pdf: { get() { return this.viewerManager.pdf }, set(v) { this.viewerManager.pdf = v } },
        pages: { get() { return this.viewerManager.pages }, set(v) { this.viewerManager.pages = v } },
        scale: { get() { return this.viewerManager.scale }, set(v) { this.viewerManager.scale = v } },
        pdfFingerprint: { get() { return this.viewerManager.pdfFingerprint }, set(v) { this.viewerManager.pdfFingerprint = v } },
        activeScoreName: { get() { return this.viewerManager.activeScoreName }, set(v) { this.viewerManager.activeScoreName = v } }
    });

    app.loadPDF = (data, name, expectedFp) => app.viewerManager.loadPDF(data, name, expectedFp);
    app.renderPDF = () => app.viewerManager.renderPDF();
    app.getFingerprint = (buf) => app.viewerManager.getFingerprint(buf);
    app.updateZoomDisplay = () => {
        app.viewerManager.updateZoomDisplay();
        app.viewPanelManager?.updateZoomDisplay();
    };
    app.changeZoom = (delta) => app.viewerManager.changeZoom(delta);
    app.fitToWidth = () => app.viewerManager.fitToWidth();
    app.fitToHeight = () => app.viewerManager.fitToHeight();
    app.showMainUI = () => app.viewerManager.showMainUI();
    app.hideWelcome = () => app.viewerManager.hideWelcome();
    app.checkInitialView = () => app.viewerManager.checkInitialView();
    app.closeFile = () => app.viewerManager.closeFile();
    app.openFileHandle = (h) => app.viewerManager.openFileHandle(h);
    app.openPdfFilePicker = () => app.viewerManager.openPdfFilePicker();
    app.handleUpload = (e) => app.viewerManager.handleUpload(e);

    // --- AnnotationManager Proxies ---
    app.redrawStamps = (p) => app.annotationManager.redrawStamps(p);
    app.redrawAllAnnotationLayers = () => app.annotationManager.redrawAllAnnotationLayers();
    app.createAnnotationLayers = (...args) => app.viewerManager.createAnnotationLayers(...args);
    app.drawPathOnCanvas = (...a) => app.annotationManager.drawPathOnCanvas(...a);
    app.drawStampOnCanvas = (...a) => app.annotationManager.drawStampOnCanvas(...a);
    app.createCaptureOverlay = (...a) => app.annotationManager.createCaptureOverlay(...a);
    app.isStampTool = () => app.annotationManager.isStampTool();
    app.getStampLabel = (s) => app.annotationManager.getStampLabel(s);
    app.getStampIcon = (s) => app.annotationManager.getStampIcon(s);
    app.findNearbyStamps = (...a) => app.annotationManager.findNearbyStamps(...a);
    app.findClosestStamp = (...a) => app.annotationManager.findClosestStamp(...a);
    app.eraseStampTarget = (s) => app.annotationManager.eraseStampTarget(s);
    app.showEraseMenu = (...a) => app.annotationManager.showEraseMenu(...a);
    app.closeEraseMenu = () => app.annotationManager.closeEraseMenu();
    app.showEraseAllModal = () => app.annotationManager.showEraseAllModal();
    app.closeEraseAllModal = () => app.annotationManager.closeEraseAllModal();
    app.eraseAllByCategory = (c) => app.annotationManager.eraseAllByCategory(c);
    app.showSelectMenu = (...a) => app.annotationManager.showSelectMenu(...a);
    app.closeSelectMenu = () => app.annotationManager.closeSelectMenu();
    app.addStamp = (p, t, x, y) => app.annotationManager.addStamp(p, t, x, y);
    app.cleanupAnchors = (p) => app.annotationManager.cleanupAnchors(p);
    app.drawPageEndAnchor = (p) => app.annotationManager.drawPageEndAnchor(p);

    // --- RulerManager Proxies ---
    Object.defineProperties(app, {
        rulerVisible: { get() { return this.rulerManager.rulerVisible }, set(v) { this.rulerManager.rulerVisible = v } },
        jumpOffsetPx: { get() { return this.rulerManager.jumpOffsetPx }, set(v) { this.rulerManager.jumpOffsetPx = v } },
        nextTargetAnchor: { get() { return this.rulerManager.nextTargetAnchor }, set(v) { this.rulerManager.nextTargetAnchor = v } },
        jumpHistory: { get() { return this.rulerManager.jumpHistory }, set(v) { this.rulerManager.jumpHistory = v } }
    });
    app.jump = (d) => app.rulerManager.jump(d);
    app.updateJumpLinePosition = () => app.rulerManager.updateJumpLinePosition();
    app.updateRulerPosition = () => app.rulerManager.updateRulerPosition();
    app.updateRulerClip = () => app.rulerManager.updateRulerClip();
    app.updateRulerMarks = () => app.rulerManager.updateRulerMarks();
    app.computeNextTarget = () => app.rulerManager.computeNextTarget();
    app.scrollToNextTarget = () => app.rulerManager.scrollToNextTarget();
    app.toggleRuler = () => app.rulerManager.toggleRuler();

    // --- Persistence & Layer Proxies ---
    app.saveToStorage = () => app.persistenceManager.saveToStorage();
    app.loadFromStorage = (fp) => app.persistenceManager.loadFromStorage(fp);
    app.addToRecentSoloScores = (n) => app.persistenceManager.addToRecentSoloScores(n);
    app.addNewLayer = () => app.layerManager.addNewLayer();
    app.deleteLayer = (id) => app.layerManager.deleteLayer(id);
    app.resetLayers = () => app.layerManager.resetLayers();
    app.renderLayerUI = () => app.layerManager.renderLayerUI();

    // --- DocAction Proxies ---
    app.exportProject = (g) => app.docActionManager.exportProject(g);
    app.handleImport = (e) => app.docActionManager.handleImport(e);
    app.importAsNewPersona = (d) => app.docActionManager.importAsNewPersona(d);
    app.overwriteProject = (d) => app.docActionManager.overwriteProject(d);
    app.showDialog = (o) => app.docActionManager.showDialog(o);

    // --- UI/Panel Proxies ---
    app.toggleSettings = (f) => app.settingsPanelManager.toggle(f);
    app.toggleLibrary = (f) => app.scoreManager.toggleOverlay(f);
    app.toggleScoreDetail = (f) => app.scoreDetailManager?.showPanel(f);
    app.toggleDocBar = () => app.docBarManager?.toggleDocBar();
    app.toggleShortcuts = (f) => {
        if (!app.shortcutsModal) return;
        app.shortcutsModal.classList.toggle('active', f !== undefined ? f : !app.shortcutsModal.classList.contains('active'));
    };

    // --- ToolManager Proxies ---
    app.getIcon = (...a) => app.toolManager.getIcon(...a);
    app.updateActiveTools = (...a) => app.toolManager.updateActiveTools(...a);
    app.toggleStampPalette = (x, y) => app.toolManager.toggleStampPalette(x, y);

    // --- Collaboration Proxies ---
    app.renderSourceUI = () => app.collaborationManager.renderSourceUI();
    app.addSource = () => app.collaborationManager.addSource();
    app.updateScoreDetailUI = (f) => app.scoreDetailManager?.load(f);
}
