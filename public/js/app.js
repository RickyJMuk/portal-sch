// Global JavaScript functionality for School Portal

document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    initTooltips();
    
    // Handle form submissions
    initFormHandlers();
    
    // Initialize animations
    initAnimations();
    
    // Handle responsive navigation
    initNavigation();
});

// Initialize Bootstrap tooltips
function initTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

// Handle form submissions with loading states
function initFormHandlers() {
    const forms = document.querySelectorAll('form[id]');
    
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            const submitBtn = this.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Processing...';
                
                // Re-enable after 5 seconds as fallback
                setTimeout(() => {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = submitBtn.dataset.originalText || 'Submit';
                }, 5000);
            }
        });
    });
}

// Initialize scroll animations
function initAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
            }
        });
    }, observerOptions);
    
    // Observe cards and sections
    const elementsToAnimate = document.querySelectorAll('.card, .stat-card, .subject-card');
    elementsToAnimate.forEach(el => observer.observe(el));
}

// Handle responsive navigation
function initNavigation() {
    const navbar = document.querySelector('.navbar');
    
    if (navbar) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 50) {
                navbar.classList.add('navbar-scrolled');
            } else {
                navbar.classList.remove('navbar-scrolled');
            }
        });
    }
}

// Utility functions
const Utils = {
    // Show toast notification
    showToast: function(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container') || this.createToastContainer();
        
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white bg-${type} border-0`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    <i class="fas fa-${this.getToastIcon(type)} me-2"></i>
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
        
        // Remove toast element after it's hidden
        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    },
    
    createToastContainer: function() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
        return container;
    },
    
    getToastIcon: function(type) {
        const icons = {
            'success': 'check-circle',
            'danger': 'exclamation-triangle',
            'warning': 'exclamation-circle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    },
    
    // Confirm dialog
    confirm: function(message, callback) {
        if (confirm(message)) {
            callback();
        }
    },
    
    // Format date
    formatDate: function(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },
    
    // Format time ago
    timeAgo: function(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        const intervals = [
            { label: 'year', seconds: 31536000 },
            { label: 'month', seconds: 2592000 },
            { label: 'day', seconds: 86400 },
            { label: 'hour', seconds: 3600 },
            { label: 'minute', seconds: 60 }
        ];
        
        for (const interval of intervals) {
            const count = Math.floor(diffInSeconds / interval.seconds);
            if (count >= 1) {
                return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
            }
        }
        
        return 'Just now';
    }
};

// Assignment specific JavaScript
const Assignment = {
    // Auto-save answers
    autoSave: function() {
        const form = document.getElementById('assignmentForm');
        if (!form) return;
        
        const inputs = form.querySelectorAll('input[type="radio"]');
        inputs.forEach(input => {
            input.addEventListener('change', function() {
                const answers = {};
                const checkedInputs = form.querySelectorAll('input[type="radio"]:checked');
                checkedInputs.forEach(checkedInput => {
                    answers[checkedInput.name] = checkedInput.value;
                });
                
                localStorage.setItem(`assignment_${form.action.split('/').pop()}`, JSON.stringify(answers));
            });
        });
    },
    
    // Load saved answers
    loadSaved: function() {
        const form = document.getElementById('assignmentForm');
        if (!form) return;
        
        const assignmentId = form.action.split('/').pop();
        const saved = localStorage.getItem(`assignment_${assignmentId}`);
        
        if (saved) {
            const answers = JSON.parse(saved);
            Object.keys(answers).forEach(questionId => {
                const input = form.querySelector(`input[name="${questionId}"][value="${answers[questionId]}"]`);
                if (input) {
                    input.checked = true;
                    input.closest('.option-label').classList.add('active');
                }
            });
        }
    },
    
    // Clear saved answers
    clearSaved: function(assignmentId) {
        localStorage.removeItem(`assignment_${assignmentId}`);
    }
};

// Student Dashboard specific
const StudentDashboard = {
    // Update progress bars
    updateProgress: function() {
        const progressBars = document.querySelectorAll('.progress-bar');
        progressBars.forEach(bar => {
            const width = bar.style.width;
            bar.style.width = '0%';
            setTimeout(() => {
                bar.style.width = width;
            }, 100);
        });
    }
};

// Admin Dashboard specific
const AdminDashboard = {
    // Initialize charts
    initCharts: function() {
        // Chart initialization would go here
        // Using Chart.js or similar library
    },
    
    // Handle bulk actions
    initBulkActions: function() {
        const checkboxes = document.querySelectorAll('input[type="checkbox"][data-id]');
        const bulkActions = document.querySelector('.bulk-actions');
        
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const checkedBoxes = document.querySelectorAll('input[type="checkbox"][data-id]:checked');
                if (checkedBoxes.length > 0 && bulkActions) {
                    bulkActions.style.display = 'block';
                } else if (bulkActions) {
                    bulkActions.style.display = 'none';
                }
            });
        });
    }
};

// Export for use in other scripts
window.Utils = Utils;
window.Assignment = Assignment;
window.StudentDashboard = StudentDashboard;
window.AdminDashboard = AdminDashboard;

// Initialize assignment auto-save if on assignment page
if (document.getElementById('assignmentForm')) {
    Assignment.autoSave();
    Assignment.loadSaved();
}

// Initialize student dashboard features
if (document.body.classList.contains('student-dashboard')) {
    StudentDashboard.updateProgress();
}

// Initialize admin dashboard features
if (document.body.classList.contains('admin-dashboard')) {
    AdminDashboard.initCharts();
    AdminDashboard.initBulkActions();
}

// Add some keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + / for help
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        // Show help modal or tooltip
    }
    
    // Escape to close modals
    if (e.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal.show');
        openModals.forEach(modal => {
            bootstrap.Modal.getInstance(modal)?.hide();
        });
    }
});