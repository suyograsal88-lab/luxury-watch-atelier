document.querySelectorAll('form[data-preview-form]').forEach(form => {
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const status = form.querySelector('.form-status');
    if (status) status.textContent = 'Preview only — your details have not been sent or stored.';
    form.reset();
  });
});
