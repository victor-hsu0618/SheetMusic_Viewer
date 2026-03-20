/**
 * PlaybackManager.js
 * Orchestrates YouTube and local media playback with A-B looping and speed control.
 */

const ICON_SMALL_RESTART = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>';
const ICON_RENEW = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="opacity:0.7;"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
export class PlaybackManager {
    constructor(app) {
        this.app = app;
        this.panel = null;
        this.player = null; // YouTube Player instance
        this.localMedia = null; // HTML5 Video/Audio element
        this.isVisible = false;

        this.loopActive = false;
        this.loopA = null; // Seconds
        this.loopB = null; // Seconds

        this.youtubeApiReady = false;
        this.currentMedia = {
            type: null, // 'youtube' | 'local'
            source: null // URL or File object
        };
        this.currentMediaObj = null; // Full object including bookmarks
    }

    init() {
        this.panel = document.getElementById('playback-panel');
        if (!this.panel) {
            console.error('[PlaybackManager] Panel element not found');
            return;
        }

        this.initElements();
        this.initEventListeners();
        this.loadYoutubeApi();
        this.initResizable();
    }
    initElements() {
        this.mediaContainer = this.panel.querySelector('.media-viewport');
        this.closeBtn = this.panel.querySelector('.close-playback');
        
        // Note: load-youtube and youtube-url-input removed as they live in Sidebar Panel
        this.localFileInput = this.panel.querySelector('.local-file-input');
        this.selectFileBtn = this.panel.querySelector('.select-file-btn');

        this.playPauseBtn = this.panel.querySelector('.play-pause');
        this.stopBtn = this.panel.querySelector('.stop-media');
        this.speedSelect = this.panel.querySelector('.playback-speed');

        this.setABtn = this.panel.querySelector('.set-a');
        this.setBBtn = this.panel.querySelector('.set-b');
        this.toggleLoopBtn = this.panel.querySelector('.toggle-loop');
        this.clearLoopBtn = this.panel.querySelector('.clear-loop');
        this.aTimeDisplay = this.panel.querySelector('.a-time');
        this.bTimeDisplay = this.panel.querySelector('.b-time');
        this.resizeHandle = this.panel.querySelector('.panel-resize-handle');

        this.addBookmarkBtn = this.panel.querySelector('.add-media-bookmark');
        this.bookmarksList = this.panel.querySelector('.bookmarks-list');
    }

    initEventListeners() {
        if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.hide());

        if (this.selectFileBtn) {
            this.selectFileBtn.addEventListener('click', () => this.localFileInput.click());
        }

        if (this.localFileInput) {
            this.localFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.loadLocalFile(file);
            });
        }

        if (this.playPauseBtn) {
            this.playPauseBtn.addEventListener('click', () => this.togglePlayback());
        }

        if (this.stopBtn) {
            this.stopBtn.addEventListener('click', () => this.stop());
        }

        if (this.speedSelect) {
            this.speedSelect.addEventListener('change', () => {
                this.setSpeed(parseFloat(this.speedSelect.value));
            });
        }

        if (this.setABtn) {
            this.setABtn.addEventListener('click', () => this.setPoint('A'));
        }

        if (this.setBBtn) {
            this.setBBtn.addEventListener('click', () => this.setPoint('B'));
        }

        if (this.toggleLoopBtn) {
            this.toggleLoopBtn.addEventListener('click', () => this.toggleLoop());
        }

        if (this.clearLoopBtn) {
            this.clearLoopBtn.addEventListener('click', () => this.clearLoop());
        }

        if (this.addBookmarkBtn) {
            this.addBookmarkBtn.addEventListener('click', () => this.addPlaybackBookmark());
        }

        if (this.bookmarksList) {
            this.bookmarksList.addEventListener('click', (e) => this.handleBookmarkActions(e));
            this.bookmarksList.addEventListener('change', (e) => this.handleBookmarkChanges(e));
        }

        // Draggable panel logic
        this.initDraggable();
    }

    /**
     * Load media from a media object (from sidebar).
     */
    async loadMedia(mediaObj) {
        if (!mediaObj) return

        this.panel.classList.add('active')
        const viewport = this.panel.querySelector('.media-viewport')
        const placeholder = this.panel.querySelector('.media-placeholder')
        if (placeholder) placeholder.style.display = 'none'

        if (mediaObj.type === 'youtube') {
            const videoId = this.extractYoutubeId(mediaObj.source)
            if (videoId) {
                this.loadYoutubeVideo(videoId)
            }
        } else if (mediaObj.type === 'local') {
            this.loadLocalFile(mediaObj.source)
        }

        this.currentMediaObj = mediaObj;
        if (!this.currentMediaObj.bookmarks) this.currentMediaObj.bookmarks = [];
        this.renderBookmarks();
    }

    initDraggable() {
        const header = this.panel.querySelector('.playback-header');
        if (!header) return;

        let isDragging = false;
        let startX, startY, initialX, initialY;

        header.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;
            isDragging = true;
            this.panel.classList.add('dragging');

            const rect = this.panel.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            initialX = rect.left;
            initialY = rect.top;

            header.setPointerCapture(e.pointerId);
            e.preventDefault();
        });

        header.addEventListener('pointermove', (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newX = initialX + dx;
            let newY = initialY + dy;

            // Viewport constraints
            const panelRect = this.panel.getBoundingClientRect();
            newX = Math.max(10, Math.min(window.innerWidth - panelRect.width - 10, newX));
            newY = Math.max(10, Math.min(window.innerHeight - panelRect.height - 10, newY));

            // ANCHOR SNAPPING
            const snapResult = this.checkAnchorSnapping(newX, newY, panelRect.width, panelRect.height);
            if (snapResult) {
                newX = snapResult.x;
                newY = snapResult.y;
            }

            this.panel.style.left = `${newX}px`;
            this.panel.style.top = `${newY}px`;
            this.panel.style.bottom = 'auto';
            this.panel.style.right = 'auto';
        });

        header.addEventListener('pointerup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            this.panel.classList.remove('dragging');
            header.releasePointerCapture(e.pointerId);

            // Optional: Final edge snap if not snapped to anchor
            this.snapToEdges();
        });
    }

    initResizable() {
        const handle = this.resizeHandle;
        if (!handle) return;

        let isResizing = false;
        let startX, startY, startWidth, startHeight;
        const el = this.panel;

        const start = (e) => {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            startX = e.clientX || (e.touches && e.touches[0].clientX);
            startY = e.clientY || (e.touches && e.touches[0].clientY);
            startWidth = el.offsetWidth;
            startHeight = el.offsetHeight;
            el.style.transition = 'none';
        };

        const move = (e) => {
            if (!isResizing) return;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            
            let newWidth = startWidth + (clientX - startX);
            let newHeight = startHeight + (clientY - startY);

            // Dynamic boundary check
            const rect = el.getBoundingClientRect();
            const winH = window.innerHeight;
            const winW = window.innerWidth;
            
            // Limit width to screen
            if (rect.left + newWidth > winW - 10) {
                newWidth = winW - rect.left - 10;
            }

            // Limit height to screen (considering current position)
            if (rect.top + newHeight > winH - 20) {
                newHeight = winH - rect.top - 20;
            }

            if (newWidth > 200) el.style.width = newWidth + 'px';
            if (newHeight > 100) el.style.height = newHeight + 'px';
        };

        const end = () => {
            if (isResizing) {
                isResizing = false;
                el.style.transition = '';
            }
        };

        handle.addEventListener('pointerdown', start);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
    }

    /**
     * Check if the panel should snap to a nearby "anchor" stamp.
     */
    checkAnchorSnapping(x, y, width, height) {
        if (!this.app.stamps) return null;

        // Only snap to anchors on visible pages in the viewport
        const anchors = this.app.stamps.filter(s => s.type === 'anchor');
        const SNAP_THRESHOLD = 30; // pixels

        for (const anchor of anchors) {
            const pageElem = document.querySelector(`.page-container[data-page="${anchor.page}"]`);
            if (!pageElem) continue;

            const pageRect = pageElem.getBoundingClientRect();
            // Check if page is somewhat in view
            if (pageRect.bottom < 0 || pageRect.top > window.innerHeight) continue;

            const canvas = pageElem.querySelector('.pdf-canvas');
            if (!canvas) continue;

            // Calculate absolute Y of the anchor
            const anchorAbsY = pageRect.top + (anchor.y * canvas.offsetHeight);
            const anchorAbsX = pageRect.left + (anchor.x * canvas.offsetWidth);

            // Distance from panel top-left or center? 
            // Let's snap the panel's vertical center to the anchor's Y
            const panelCenterY = y + height / 2;
            const distY = Math.abs(panelCenterY - anchorAbsY);

            // Also check horizontal proximity to the page
            const distX = Math.min(Math.abs(x - pageRect.left), Math.abs(x + width - pageRect.right));

            if (distY < SNAP_THRESHOLD && distX < width) {
                // Snap Y so panel center is at anchor Y
                return {
                    x: x, // Keep current X
                    y: anchorAbsY - height / 2
                };
            }
        }
        return null;
    }

    snapToEdges() {
        const threshold = 40; // Pixels to snap
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pw = this.panel.offsetWidth;
        const ph = this.panel.offsetHeight;
        const currentLeft = this.panel.offsetLeft;
        const currentTop = this.panel.offsetTop;

        let targetLeft = currentLeft;
        let targetTop = currentTop;

        // X snapping
        if (currentLeft < threshold) {
            targetLeft = 10; // Margin from edge
        } else if (vw - (currentLeft + pw) < threshold) {
            targetLeft = vw - pw - 10;
        }

        // Y snapping
        if (currentTop < threshold) {
            targetTop = 10;
        } else if (vh - (currentTop + ph) < threshold) {
            targetTop = vh - ph - 10;
        }

        // Special check for bottom margin on mobile (avoiding doc bar if possible)
        if (vh - (currentTop + ph) < 100 && vw - (currentLeft + pw) < 100) {
            // If near bottom-right, don't snap too deep to avoid overlapping doc bar icons too much
            // but the user asked for "备齐边角" so we should prioritize snapping.
        }

        this.panel.style.transition = 'all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
        this.panel.style.left = `${targetLeft}px`;
        this.panel.style.top = `${targetTop}px`;

        setTimeout(() => {
            this.panel.style.transition = '';
        }, 300);
    }

    loadYoutubeApi() {
        if (window.YT && window.YT.Player) {
            this.youtubeApiReady = true;
            return;
        }

        // Catch existing global callback if script beats us
        const existingCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (existingCallback) existingCallback();
            this.youtubeApiReady = true;
            console.log('[PlaybackManager] YouTube API Ready');
        };

        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }
    }

    toggle() {
        if (this.isVisible) this.hide();
        else this.show();
    }

    show() {
        this.panel.classList.add('active');
        this.isVisible = true;

        // Auto-load saved media if any
        if (this.app.scoreDetailManager?.currentInfo?.media) {
            const media = this.app.scoreDetailManager.currentInfo.media;
            if (media.type === 'youtube' && media.source && !this.player) {
                this.loadYoutube(media.source);
            }
        }
    }

    hide() {
        this.panel.classList.remove('active');
        this.isVisible = false;
        this.pause();
    }

    loadYoutube(url) {
        const videoId = this.extractYoutubeId(url);
        if (!videoId) {
            alert('Invalid YouTube URL');
            return;
        }
        this.loadYoutubeVideo(videoId, url);
    }

    loadYoutubeVideo(videoId, url = null) {
        this.cleanupMedia();
        this.currentMedia = { type: 'youtube', source: url || `https://www.youtube.com/watch?v=${videoId}` };
        this.saveToScore();

        const playerDiv = document.createElement('div');
        playerDiv.id = 'yt-player-placeholder';
        this.mediaContainer.appendChild(playerDiv);

        this.player = new YT.Player('yt-player-placeholder', {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: {
                'playsinline': 1,
                'rel': 0,
                'modestbranding': 1,
                'enablejsapi': 1,
                'iv_load_policy': 3,
                'origin': window.location.origin || (window.location.protocol + '//' + window.location.host),
                'host': 'https://www.youtube.com'
            },
            events: {
                'onReady': (event) => {
                    this.setSpeed(parseFloat(this.speedSelect.value));
                    this.startLoopMonitor();
                },
                'onStateChange': (event) => {
                    this.updatePlayPauseIcon();
                }
            }
        });

        this.panel.dataset.mediaType = 'youtube';
        this.panel.classList.add('active');
        this.isVisible = true;
    }

    loadLocalFile(file) {
        this.cleanupMedia();
        this.currentMedia = { type: 'local', source: file.name };
        this.saveToScore();

        const isVideo = file.type.startsWith('video/');
        const mediaTag = isVideo ? 'video' : 'audio';
        this.localMedia = document.createElement(mediaTag);
        this.localMedia.controls = true;
        this.localMedia.style.width = '100%';
        this.localMedia.style.height = '100%';
        this.localMedia.src = URL.createObjectURL(file);

        this.mediaContainer.appendChild(this.localMedia);
        this.panel.dataset.mediaType = 'local';

        this.localMedia.onplay = () => this.updatePlayPauseIcon();
        this.localMedia.onpause = () => this.updatePlayPauseIcon();
        this.localMedia.onended = () => this.updatePlayPauseIcon();

        this.startLoopMonitor();
    }

    cleanupMedia() {
        if (this.player) {
            this.player.destroy();
            this.player = null;
        }
        if (this.localMedia) {
            this.localMedia.pause();
            if (this.localMedia.src) URL.revokeObjectURL(this.localMedia.src);
            this.localMedia.remove();
            this.localMedia = null;
        }
        this.mediaContainer.innerHTML = '';
        this.stopLoopMonitor();
    }

    extractYoutubeId(url) {
        // Updated regex to support common formats including /shorts/
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|\/shorts\/)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    togglePlayback() {
        if (this.player) {
            const state = this.player.getPlayerState();
            if (state === 1) this.player.pauseVideo();
            else this.player.playVideo();
        } else if (this.localMedia) {
            if (this.localMedia.paused) this.localMedia.play();
            else this.localMedia.pause();
        }
    }

    pause() {
        if (this.player) this.player.pauseVideo();
        else if (this.localMedia) this.localMedia.pause();
    }

    stop() {
        if (this.player) {
            this.player.stopVideo();
            this.player.seekTo(0);
        } else if (this.localMedia) {
            this.localMedia.pause();
            this.localMedia.currentTime = 0;
        }
    }

    setSpeed(speed) {
        if (this.player && this.player.setPlaybackRate) {
            this.player.setPlaybackRate(speed);
        } else if (this.localMedia) {
            this.localMedia.playbackRate = speed;
        }
    }

    setPoint(point) {
        let time = 0;
        if (this.player) {
            time = this.player.getCurrentTime();
        } else if (this.localMedia) {
            time = this.localMedia.currentTime;
        }

        if (point === 'A') {
            this.loopA = time;
            this.aTimeDisplay.textContent = this.formatTime(time);
        } else {
            this.loopB = time;
            this.bTimeDisplay.textContent = this.formatTime(time);
        }

        // Auto-enable loop if both points are set for the first time
        if (this.loopA !== null && this.loopB !== null && !this.loopActive) {
            this.toggleLoop(true);
        }
    }

    toggleLoop(force = null) {
        this.loopActive = force !== null ? force : !this.loopActive;
        if (this.toggleLoopBtn) {
            this.toggleLoopBtn.classList.toggle('active', this.loopActive);
        }
    }

    clearLoop() {
        this.loopActive = false;
        this.loopA = null;
        this.loopB = null;
        if (this.toggleLoopBtn) this.toggleLoopBtn.classList.remove('active');
        if (this.aTimeDisplay) this.aTimeDisplay.textContent = '--:--';
        if (this.bTimeDisplay) this.bTimeDisplay.textContent = '--:--';
        this.app.showMessage('Loop Cleared', 'info');
    }

    startLoopMonitor() {
        this.stopLoopMonitor();
        this._loopInterval = setInterval(() => {
            if (!this.loopActive || this.loopA === null || this.loopB === null) return;

            let current = 0;
            if (this.player) current = this.player.getCurrentTime();
            else if (this.localMedia) current = this.localMedia.currentTime;

            const start = Math.min(this.loopA, this.loopB);
            const end = Math.max(this.loopA, this.loopB);

            if (current >= end) {
                if (this.player) this.player.seekTo(start);
                else if (this.localMedia) this.localMedia.currentTime = start;
            }
        }, 100);
    }

    stopLoopMonitor() {
        if (this._loopInterval) {
            clearInterval(this._loopInterval);
            this._loopInterval = null;
        }
    }

    formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return [h, m, s]
            .map(v => v < 10 ? "0" + v : v)
            .filter((v, i) => v !== "00" || i > 0)
            .join(":");
    }

    updatePlayPauseIcon() {
        if (!this.playPauseBtn) return;
        let isPlaying = false;
        if (this.player) {
            isPlaying = this.player.getPlayerState() === 1;
        } else if (this.localMedia) {
            isPlaying = !this.localMedia.paused && !this.localMedia.ended;
        }

        this.playPauseBtn.innerHTML = isPlaying
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    }

    saveToScore() {
        if (this.app.scoreDetailManager) {
            // currentMediaObj contains the bookmarks list
            this.app.scoreDetailManager.onModification();
        }
    }

    // ----- Bookmarks Logic -----

    async addPlaybackBookmark() {
        if (!this.currentMediaObj) return;

        let currentTime = 0;
        if (this.currentMedia.type === 'youtube' && this.player && this.player.getCurrentTime) {
            currentTime = this.player.getCurrentTime();
        } else if (this.currentMedia.type === 'local' && this.localMedia) {
            currentTime = this.localMedia.currentTime;
        } else {
            this.app.showMessage('No media playing', 'error');
            return;
        }

        const label = prompt('Enter bookmark label:', `Moment at ${this.formatTime(currentTime)}`);
        if (label === null) return; // Cancelled

        const bookmark = {
            id: 'bm_' + Date.now(),
            time: currentTime,
            label: label || `Moment at ${this.formatTime(currentTime)}`
        };

        if (!this.currentMediaObj.bookmarks) this.currentMediaObj.bookmarks = [];
        this.currentMediaObj.bookmarks.push(bookmark);
        
        // Save to score metadata
        this.saveToScore();

        this.renderBookmarks();
        this.app.showMessage('Bookmark added', 'success');
    }

    renderBookmarks() {
        if (!this.bookmarksList) return;
        this.bookmarksList.innerHTML = '';

        if (!this.currentMediaObj || !this.currentMediaObj.bookmarks || this.currentMediaObj.bookmarks.length === 0) {
            this.bookmarksList.innerHTML = '<div class="text-mini opacity-30 p-10 text-center">No bookmarks yet</div>';
            return;
        }

        // Sort by time and render using professional dark-compact style
        [...this.currentMediaObj.bookmarks].sort((a, b) => a.time - b.time).forEach(bm => {
            const li = document.createElement('div');
            li.className = 'bookmark-item';
            li.dataset.id = bm.id;
            li.dataset.time = bm.time;
            
            li.innerHTML = `
                <div class="bookmark-controls">
                    <button class="bookmark-restart-btn" title="Play from here">${ICON_SMALL_RESTART}</button>
                </div>
                <input type="text" class="bookmark-time-input" value="${this.formatTime(bm.time)}">
                <button class="renew-btn" title="Renew to current time">${ICON_RENEW}</button>
                <input type="text" class="bookmark-desc" value="${bm.label || ''}" placeholder="marker description">
                <div class="bookmark-controls">
                    <button class="loop-set-btn set-a">A</button>
                    <button class="loop-set-btn set-b">B</button>
                    <button class="delete-btn">×</button>
                </div>
            `;

            this.bookmarksList.appendChild(li);
        });
    }

    handleBookmarkActions(e) {
        const item = e.target.closest('.bookmark-item');
        if (!item) return;

        const id = item.dataset.id;
        const time = parseFloat(item.dataset.time);
        const bookmark = this.currentMediaObj.bookmarks.find(b => b.id === id);

        // 1. Restart Button: Seek and Play
        if (e.target.closest('.bookmark-restart-btn')) {
            this.seekTo(time);
            this.play();
        }
        // 2. Renew Button: Sync with current playback time
        else if (e.target.closest('.renew-btn')) {
            let currentTime = 0;
            if (this.player && this.player.getCurrentTime) currentTime = this.player.getCurrentTime();
            else if (this.localMedia) currentTime = this.localMedia.currentTime;
            
            if (bookmark) {
                bookmark.time = currentTime;
                this.saveToScore();
                this.renderBookmarks();
                if (this.app.showMessage) this.app.showMessage('Bookmark time updated', 'success');
            }
        }
        // 3. Set Point A
        else if (e.target.closest('.set-a')) {
            this.loopA = time;
            if (this.aTimeDisplay) this.aTimeDisplay.textContent = this.formatTime(time);
            if (this.app.showMessage) this.app.showMessage('Loop A set', 'info');
        }
        // 4. Set Point B
        else if (e.target.closest('.set-b')) {
            this.loopB = time;
            if (this.bTimeDisplay) this.bTimeDisplay.textContent = this.formatTime(time);
            if (this.app.showMessage) this.app.showMessage('Loop B set', 'info');
        }
        // 5. Delete Button
        else if (e.target.closest('.delete-btn')) {
            this.deleteBookmark(id);
        }
    }

    handleBookmarkChanges(e) {
        const item = e.target.closest('.bookmark-item');
        if (!item) return;

        const id = item.dataset.id;
        const bookmark = this.currentMediaObj.bookmarks.find(b => b.id === id);
        if (!bookmark) return;

        // Time Input Change
        if (e.target.classList.contains('bookmark-time-input')) {
            const newTime = this.parseTime(e.target.value);
            if (newTime !== null) {
                bookmark.time = newTime;
                this.saveToScore();
                this.renderBookmarks();
            } else {
                e.target.value = this.formatTime(bookmark.time);
            }
        }
        // Label/Description Change
        else if (e.target.classList.contains('bookmark-desc')) {
            bookmark.label = e.target.value;
            this.saveToScore();
        }
    }

    /**
     * Parse "MM:SS" or "HH:MM:SS" into seconds.
     */
    parseTime(str) {
        if (!str) return null;
        const parts = str.split(':').map(p => parseFloat(p));
        if (parts.some(isNaN)) return null;
        
        let seconds = 0;
        if (parts.length === 3) {
            seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            seconds = parts[0] * 60 + parts[1];
        } else if (parts.length === 1) {
            seconds = parts[0];
        } else {
            return null;
        }
        return seconds;
    }

    deleteBookmark(id) {
        if (!this.currentMediaObj || !this.currentMediaObj.bookmarks) return;
        
        const idx = this.currentMediaObj.bookmarks.findIndex(bm => bm.id === id);
        if (idx !== -1) {
            this.currentMediaObj.bookmarks.splice(idx, 1);
            this.saveToScore();
            this.renderBookmarks();
            this.app.showMessage('Bookmark deleted');
        }
    }

    seekTo(seconds) {
        if (this.currentMedia.type === 'youtube' && this.player && this.player.seekTo) {
            this.player.seekTo(seconds, true);
        } else if (this.currentMedia.type === 'local' && this.localMedia) {
            this.localMedia.currentTime = seconds;
        }
    }

    play() {
        if (this.currentMedia.type === 'youtube' && this.player && this.player.playVideo) {
            this.player.playVideo();
        } else if (this.currentMedia.type === 'local' && this.localMedia) {
            this.localMedia.play();
        }
    }
}
