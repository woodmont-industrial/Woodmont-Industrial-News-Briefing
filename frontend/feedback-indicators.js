// Toast Notification System
// Minimal toast notifications for user feedback without alert() boxes

const ToastManager = {
    container: null,

    init() {
          if (!this.container) {
                  this.container = document.createElement('div');
                  this.container.id = 'toast-container';
                  this.container.style.cssText = `
                          position: fixed;
                                  top: 20px;
                                          right: 20px;
                                                  z-index: 9999;
                                                          font-family: 'Segoe UI', sans-serif;
                                                                `;
                  document.body.appendChild(this.container);
          }
    },

    show(message, type = 'info', duration = 3000) {
          this.init();

      const toast = document.createElement('div');
          const bgColor = {
                  success: '#10b981',
                  error: '#ef4444',
                  warning: '#f59e0b',
                  info: '#3b82f6'
          }[type];

      toast.style.cssText = `
            background: ${bgColor};
                  color: white;
                        padding: 16px 20px;
                              border-radius: 8px;
                                    margin-bottom: 10px;
                                          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                                                animation: slideIn 300ms ease-out;
                                                      word-break: break-word;
                                                            max-width: 400px;
                                                                `;

      toast.textContent = message;
          this.container.appendChild(toast);

      setTimeout(() => {
              toast.style.animation = 'slideOut 300ms ease-out';
              setTimeout(() => toast.remove(), 300);
      }, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error', 4000); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); }
};

// Add animations to stylesheet
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
      from { 
            transform: translateX(400px);
                  opacity: 0;
                      }
                          to { 
                                transform: translateX(0);
                                      opacity: 1;
                                          }
                                            }
                                              @keyframes slideOut {
                                                  from { 
                                                        transform: translateX(0);
                                                              opacity: 1;
                                                                  }
                                                                      to { 
                                                                            transform: translateX(400px);
                                                                                  opacity: 0;
                                                                                      }
                                                                                        }
                                                                                        `;
document.head.appendChild(style);

// Replace alert() calls with toasts
window.showSuccess = (msg) => ToastManager.success(msg);
window.showError = (msg) => ToastManager.error(msg);
window.showInfo = (msg) => ToastManager.info(msg);
