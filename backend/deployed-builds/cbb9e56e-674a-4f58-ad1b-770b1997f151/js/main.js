document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.getElementById('menuToggle');
  const mobileMenu = document.getElementById('mobileMenu');

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const revealEls = document.querySelectorAll('.fade-up');
  if (revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealEls.forEach((el) => io.observe(el));
  }

  const categoryFilter = document.getElementById('categoryFilter');
  const priceFilter = document.getElementById('priceFilter');
  const productCards = document.querySelectorAll('.product-card');
  const resultsCount = document.getElementById('resultsCount');

  const applyFilters = () => {
    if (!productCards.length) return;

    const catValue = categoryFilter ? categoryFilter.value : 'all';
    const priceValue = priceFilter ? priceFilter.value : 'all';
    const maxPrice = priceValue === 'all' ? Infinity : Number(priceValue);

    let visibleCount = 0;

    productCards.forEach((card) => {
      const productCategory = card.dataset.category;
      const productPrice = Number(card.dataset.price);

      const categoryMatch = catValue === 'all' || productCategory === catValue;
      const priceMatch = productPrice <= maxPrice;

      if (categoryMatch && priceMatch) {
        card.classList.remove('hidden-card');
        visibleCount += 1;
      } else {
        card.classList.add('hidden-card');
      }
    });

    if (resultsCount) {
      resultsCount.textContent = `${visibleCount} product${visibleCount === 1 ? '' : 's'} found`;
    }
  };

  if (categoryFilter || priceFilter) {
    categoryFilter && categoryFilter.addEventListener('change', applyFilters);
    priceFilter && priceFilter.addEventListener('change', applyFilters);
    applyFilters();
  }
});