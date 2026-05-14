// Function to toggle the visibility of the menu
function toggleMenu(event, trigger) {
    event.stopPropagation();
    const menuContainer = trigger.closest('.menu-container');
    document.querySelectorAll('.menu-container').forEach(container => {
        if (container !== menuContainer) container.classList.remove('active');
    });
    menuContainer.classList.toggle('active');
}

// Close menus when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.menu-container.active').forEach(container => {
        container.classList.remove('active');
    });
});


document.querySelectorAll('.file-item').forEach(item => {
    item.addEventListener('click', () => {
        const href = item.getAttribute('data-href');
        console.log('Navigating to:', href);
        if (href) {
            window.location.href = href;
        }
    });
});