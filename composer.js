export function installComposer() {
    const input = document.getElementById('send_textarea');
    if (!input) return;
    const update = () => {
        if (document.documentElement.classList.contains('ah-layout') && input.placeholder !== 'here, but elsewhere') {
            input.placeholder = 'here, but elsewhere';
        }
    };
    new MutationObserver(update).observe(input, { attributes: true, attributeFilter: ['placeholder'] });
    new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    update();
}
