/**
 * PlaybackManager.js
 * Orchestrates YouTube and local media playback with A-B looping and speed control.
 */
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
    }

    initElements() {
        this.mediaContainer = this.panel.querySelector('.media-viewport');
        this.closeBtn = this.panel.querySelector('.close-playback');
        this.loadYoutubeBtn = this.panel.querySelector('.load-youtube');
        this.youtubeUrlInput = this.panel.querySelector('.youtube-url-input');
        this.localFileInput = this.panel.querySelector('.local-file-input');
        this.selectFileBtn = this.panel.querySelector('.select-file-btn');

        this.playPauseBtn = this.panel.querySelector('.play-pause');
        this.stopBtn = this.panel.querySelector('.stop-media');
        this.speedSelect = this.panel.querySelector('.playback-speed');

        this.setABtn = this.panel.querySelector('.set-a');
        this.setBBtn = this.panel.querySelector('.set-b');
        this.toggleLoopBtn = this.panel.querySelector('.toggle-loop');
        this.aTimeDisplay = this.panel.querySelector('.a-time');
        this.bTimeDisplay = this.panel.querySelector('.b-time');
    }

    initEventListeners() {
        if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.hide());

        if (this.loadYoutubeBtn) {
            this.loadYoutubeBtn.addEventListener('click', () => {
                const url = this.youtubeUrlInput.value.trim();
                if (url) this.loadYoutube(url);
            });
        }

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
        if (window.YT) {
            this.youtubeApiReady = true;
            return;
        }

        window.onYouTubeIframeAPIReady = () => {
            this.youtubeApiReady = true;
            console.log('[PlaybackManager] YouTube API Ready');
        };

        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
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

        this.cleanupMedia();
        this.currentMedia = { type: 'youtube', source: url };
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
                'modestbranding': 1
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
        this.youtubeUrlInput.value = url;
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
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
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
    }

    toggleLoop() {
        this.loopActive = !this.loopActive;
        this.toggleLoopBtn.classList.toggle('active', this.loopActive);
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
            this.app.scoreDetailManager.currentInfo.media = this.currentMedia;
            this.app.scoreDetailManager.onModification();
        }
    }
}
