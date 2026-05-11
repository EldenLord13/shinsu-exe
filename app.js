/* ============================================================
   Anime.exe — app.js
   Interactive functionality for the main page.
   ============================================================ */

// Global state — must live outside the IIFE so openPlayer and
// updateLanguage() can both read/write the current anime dataset.
let currentAnimeData  = [];
let favoriteAnime     = JSON.parse(localStorage.getItem('anime_favorites')) || [];
let currentOpenAnime  = null; // tracks the anime currently shown in the detail view

(function () {
  'use strict';

  /* ----------------------------------------------------------
     CHANGE BACKGROUND — Featured Artist Studio
     Clicking the button opens a hidden file picker. When the
     user selects an image, FileReader converts it to a data URL
     and injects it as the artist panel's background-image.
  ---------------------------------------------------------- */

  var changeBgBtn = document.getElementById('btn-change-bg');
  var bgUpload    = document.getElementById('bg-upload');
  var artistPanel = document.getElementById('artist-panel');

  if (changeBgBtn && bgUpload && artistPanel) {

    changeBgBtn.addEventListener('click', function () {
      bgUpload.click();
    });

    bgUpload.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file || !file.type.startsWith('image/')) return;

      var reader = new FileReader();
      reader.addEventListener('load', function (evt) {
        artistPanel.style.backgroundImage    = 'url("' + evt.target.result + '")';
        artistPanel.style.backgroundSize     = 'cover';
        artistPanel.style.backgroundPosition = 'center';

        // Brief feedback on button label
        changeBgBtn.childNodes[0].nodeValue = ' Photo Updated! ';
        setTimeout(function () {
          changeBgBtn.childNodes[0].nodeValue = ' Change Background ';
        }, 2000);
      });
      reader.readAsDataURL(file);
      bgUpload.value = '';
    });
  }

  /* ----------------------------------------------------------
     JIKAN API — Currently Watching cards
     Fetches the top 3 currently airing anime from Jikan v4
     and populates the three sidebar cards with live data.
  ---------------------------------------------------------- */

  var JIKAN_URL = 'https://api.jikan.moe/v4/top/anime?filter=airing&limit=3';

  // Star SVG reused inside each card-meta paragraph
  var STAR_SVG = '<svg class="star-icon" xmlns="http://www.w3.org/2000/svg" '
    + 'viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 '
    + '9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

  /**
   * Updates a single anime card element with data from the Jikan API.
   * @param {HTMLElement} card  - The .anime-card article element
   * @param {Object}      anime - One item from the Jikan data array
   */
  function populateCard(card, anime) {
    // 1. Poster image
    var img = card.querySelector('.card-thumb img');
    if (img) {
      img.src = anime.images.jpg.large_image_url;
      img.alt = anime.title;
    }

    // 2. Title
    var title = card.querySelector('.card-title');
    if (title) title.textContent = anime.title;

    // 3. Meta line  — genre · episodes · score ★
    var meta = card.querySelector('.card-meta');
    if (meta) {
      var genre   = (anime.genres && anime.genres[0]) ? anime.genres[0].name : 'Anime';
      var episodes = anime.episodes ? 'Ep ' + anime.episodes : 'Ongoing';
      var score    = anime.score    ? anime.score             : 'N/A';
      meta.innerHTML = genre + ' &nbsp;|&nbsp; ' + episodes + ' &nbsp;|&nbsp; ' + score + STAR_SVG;
    }

    // 4. Badge — always "Ongoing" for airing anime
    var badge = card.querySelector('.badge');
    if (badge) {
      badge.textContent = 'Ongoing';
      badge.className   = 'badge badge-ongoing';
    }
  }

  /**
   * Fetches the top 3 airing anime from Jikan and updates the
   * Currently Watching sidebar cards.
   */
  async function fetchTopAiring() {
    var cards = document.querySelectorAll('.sidebar-card');
    if (!cards.length) return;

    try {
      var response = await fetch(JIKAN_URL);
      if (!response.ok) throw new Error('Jikan API error: ' + response.status);

      var json = await response.json();
      var animeList = json.data;

      // Update up to 3 cards (whichever is fewer — cards or results)
      var count = Math.min(cards.length, animeList.length);
      for (var i = 0; i < count; i++) {
        populateCard(cards[i], animeList[i]);
      }

    } catch (err) {
      // Silently fail — placeholder content remains visible
      console.warn('fetchTopAiring failed:', err.message);
    }
  }

  // Auto-call on page load
  fetchTopAiring();

  /* ----------------------------------------------------------
     JIKAN API — Library Grid
     State variables track the active URL and page so Load More
     always knows what to paginate.
  ---------------------------------------------------------- */

  var LIBRARY_URL = 'https://api.jikan.moe/v4/top/anime?limit=8';
  var SEARCH_URL  = 'https://api.jikan.moe/v4/anime?sfw=true&limit=8&q=';
  var TOP_URL     = 'https://api.jikan.moe/v4/top/anime?limit=8';
  var ONGOING_URL = 'https://api.jikan.moe/v4/top/anime?filter=airing&limit=8';

  // Shared pagination state — reset whenever the active source changes
  var currentPage   = 1;
  var currentApiUrl = LIBRARY_URL;
  // NOTE: currentAnimeData is declared globally above the IIFE.

  // Maps genre display names → Jikan numerical genre IDs
  var genreMap = {
    'Action':       1,
    'Adventure':    2,
    'Comedy':       4,
    'Drama':        8,
    'Fantasy':      10,
    'Horror':       14,
    'Mecha':        18,
    'Mystery':      7,
    'Romance':      22,
    'Sci-Fi':       24,
    'Slice of Life':36,
    'Sports':       30,
    'Supernatural': 37,
    'Thriller':     41
  };

  /* ----------------------------------------------------------
     FAVORITES — localStorage-backed save/remove system
  ---------------------------------------------------------- */

  /**
   * Displays a brief toast notification at the bottom of the screen.
   * Auto-removes itself after 2.5 s.
   * @param {string} msg - Message to display
   */
  function showToast(msg) {
    var existing = document.getElementById('fav-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id            = 'fav-toast';
    toast.textContent   = msg;
    toast.style.cssText = [
      'position:fixed', 'bottom:1.5rem', 'left:50%',
      'transform:translateX(-50%)',
      'background:var(--bg-surface)',
      'border:1px solid var(--accent-border)',
      'color:var(--text-primary)',
      'padding:0.55rem 1.4rem',
      'border-radius:30px',
      'font-size:0.82rem',
      'font-family:var(--font)',
      'box-shadow:0 4px 24px rgba(0,0,0,0.5),0 0 0 1px rgba(232,69,60,0.25)',
      'z-index:99999',
      'opacity:0',
      'transition:opacity 0.2s ease',
      'pointer-events:none'
    ].join(';');
    document.body.appendChild(toast);
    // Fade in
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { toast.style.opacity = '1'; });
    });
    // Fade out and remove
    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 250);
    }, 2500);
  }

  /**
   * Adds or removes an anime from the favoriteAnime array, persists to
   * localStorage, shows a toast, then updates the UI.
   * @param {string|number} animeId - anime.mal_id from Jikan
   */
  function toggleFavorite(animeId) {
    var id  = parseInt(animeId, 10);
    var idx = favoriteAnime.findIndex(function (a) { return a.mal_id === id; });

    if (idx > -1) {
      favoriteAnime.splice(idx, 1);
      showToast('\u2665 Removed from Favorites');
    } else {
      var animeToAdd = currentAnimeData.find(function (a) { return a.mal_id === id; });
      if (animeToAdd) {
        favoriteAnime.push(animeToAdd);
        showToast('\u2665 Added to Favorites!');
      }
    }

    localStorage.setItem('anime_favorites', JSON.stringify(favoriteAnime));

    // If the Favorites tab is active, re-render it immediately so the
    // removed/added card reflects straight away.
    var favTab = document.querySelector('.category-tab[data-type="favorites"]');
    if (favTab && favTab.classList.contains('active-tab')) {
      renderGrid(favoriteAnime, false);
    } else {
      // Otherwise just redraw the current grid to flip heart colours
      renderGrid(currentAnimeData, false);
    }
  }

  /**
   * Returns the best available title for the current language.
   * In Russian mode, searches anime.titles[] for a Russian entry or any
   * string containing Cyrillic characters. Falls back to anime.title.
   * @param {Object} anime - One Jikan data item
   * @returns {string} The localised display title
   */
  function getLocalizedTitle(anime) {
    if (currentLang === 'ru') {
      // 1. Check the structured titles array (Jikan v4 format)
      if (anime.titles && Array.isArray(anime.titles)) {
        var ruEntry = anime.titles.find(function (t) {
          return t.type === 'Russian' || /[А-Яа-яЁё]/.test(t.title);
        });
        if (ruEntry) return ruEntry.title;
      }
      // 2. Fallback: scan title_synonyms for any Cyrillic string
      if (anime.title_synonyms && Array.isArray(anime.title_synonyms)) {
        var ruSynonym = anime.title_synonyms.find(function (s) {
          return /[А-Яа-яЁё]/.test(s);
        });
        if (ruSynonym) return ruSynonym;
      }
    }
    // Default: English / Romaji title
    return anime.title || 'Unknown Title';
  }

  /**
   * Builds the HTML string for one library grid card.
   * Cards are now fully clickable — no inline action buttons.
   * The detail modal handles Watch, Fav, and Plan.
   * @param {Object} anime  - One Jikan data item
   * @param {number} index  - Card index (used for unique IDs)
   * @returns {string} HTML string
   */
  function buildLibCard(anime, index) {
    var img          = (anime.images && anime.images.jpg && anime.images.jpg.large_image_url)
                         ? anime.images.jpg.large_image_url : '';
    var title        = anime.title || 'Unknown Title';
    var safeTitle    = title.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    var displayTitle = getLocalizedTitle(anime);
    var score        = anime.score    ? anime.score    : 'N/A';
    var episodes     = anime.episodes ? 'Ep ' + anime.episodes : 'Ongoing';
    var genre        = (anime.genres && anime.genres[0]) ? anime.genres[0].name : 'Anime';
    var synopsis     = anime.synopsis
      ? anime.synopsis.replace(/"/g, '&quot;').slice(0, 120) + '…'
      : 'No synopsis available.';
    // Show filled heart on the card badge if already favourited
    var isFav        = favoriteAnime.some(function (f) { return f.mal_id === anime.mal_id; });
    var favBadge     = isFav ? '<span class="card-fav-indicator" title="In Favorites">♥</span>' : '';

    return `
      <article class="lib-card" id="lib-card-dyn-${index}" role="listitem"
               data-id="${anime.mal_id}" style="cursor:pointer;">
        <div class="lib-card__poster">
          <img src="${img}" alt="${safeTitle}" loading="lazy" />
          <div class="lib-card__overlay">
            <p class="lib-card__synopsis">${synopsis}</p>
            <span class="lib-card__view-hint">▶ View Details</span>
          </div>
        </div>
        <div class="lib-card__body">
          <h3 class="lib-card__title">${displayTitle} ${favBadge}</h3>
          <p class="lib-card__meta">
            ${genre} &nbsp;·&nbsp; ${episodes} &nbsp;·&nbsp;
            <span class="lib-rating">${score}
              <svg class="lib-star" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77
                         l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </span>
          </p>
          <span class="badge badge-ongoing">Ongoing</span>
        </div>
      </article>`;
  }

  /**
   * Renders anime cards into #library-grid.
   * Each card is fully clickable and opens openDetailsModal on click.
   */
  function renderGrid(animeArray, append) {
    var grid = document.getElementById('library-grid');
    if (!grid) return;

    // Update global data tracker
    if (!append) {
      currentAnimeData = animeArray || [];
    } else {
      currentAnimeData = currentAnimeData.concat(animeArray || []);
    }

    // Empty-state message
    if (!animeArray || !animeArray.length) {
      if (!append) {
        grid.innerHTML = '<p style="color:var(--text-secondary);padding:2rem;grid-column:1/-1;text-align:center;">No results found.</p>';
      }
      return;
    }

    // Build all card HTML as one string, then inject once
    var offset = append ? grid.querySelectorAll('.lib-card').length : 0;
    var html   = '';
    animeArray.forEach(function (anime, i) {
      html += buildLibCard(anime, offset + i);
    });

    if (append) {
      grid.innerHTML += html;
    } else {
      grid.innerHTML = html;
    }

    // Each card click opens the detail page — .onclick survives innerHTML wipes
    document.querySelectorAll('.lib-card[data-id]').forEach(function (card) {
      card.onclick = function () {
        openDetailPage(card.dataset.id);
      };
    });
  }

  /**
   * Fetches the top 8 anime from Jikan and renders them into #library-grid.
   */
  async function loadLibraryGrid() {
    var grid = document.getElementById('library-grid');
    if (!grid) return;

    currentPage   = 1;
    currentApiUrl = LIBRARY_URL;

    try {
      var response = await fetch(LIBRARY_URL);
      if (!response.ok) throw new Error('Jikan error: ' + response.status);

      var json = await response.json();
      renderGrid(json.data, false);

    } catch (err) {
      console.warn('loadLibraryGrid failed:', err.message);
    }
  }

  // Fire on page load
  loadLibraryGrid();

  /* ----------------------------------------------------------
     SEARCH — #search-bar listens for Enter and queries Jikan
  ---------------------------------------------------------- */

  var searchBar = document.getElementById('search-bar');

  if (searchBar) {
    searchBar.addEventListener('keypress', async function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();

      var query = searchBar.value.trim();
      if (!query) return;

      // Reset pagination state for this new source
      currentPage   = 1;
      currentApiUrl = SEARCH_URL + encodeURIComponent(query);

      var grid = document.getElementById('library-grid');
      if (grid) {
        grid.innerHTML = '<p style="color:var(--text-secondary);padding:2rem;grid-column:1/-1;text-align:center;">Loading…</p>';
      }

      try {
        var response = await fetch(currentApiUrl);
        if (!response.ok) throw new Error('Search error: ' + response.status);

        var json = await response.json();
        renderGrid(json.data, false);

      } catch (err) {
        console.warn('Search failed:', err.message);
        if (grid) {
          grid.innerHTML = '<p style="color:var(--text-secondary);padding:2rem;grid-column:1/-1;text-align:center;">Search failed. Please try again.</p>';
        }
      }

      var target = document.getElementById('library-grid');
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  }

  /* ----------------------------------------------------------
     CATEGORY TABS — Top Rating & Ongoing
  ---------------------------------------------------------- */

  var categoryTabs = document.querySelectorAll('.category-tab');
  var loadMoreWrap  = document.getElementById('lib-pagination'); // the Load More wrapper

  categoryTabs.forEach(function (tab) {
    tab.addEventListener('click', async function () {

      // Swap active classes across ALL lib-tabs (not just category-tabs)
      document.querySelectorAll('.lib-tab').forEach(function (t) {
        t.classList.remove('active-tab', 'lib-tab--active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active-tab', 'lib-tab--active');
      tab.setAttribute('aria-selected', 'true');

      var grid = document.getElementById('library-grid');
      var type = tab.dataset.type;

      // ── LOCAL LIBRARY tabs: read from localStorage, no fetch ──────────
      var localLibraryTypes = ['favorites', 'planning', 'watching', 'completed'];
      if (localLibraryTypes.includes(type)) {
        if (loadMoreWrap) loadMoreWrap.style.display = 'none'; // pagination N/A

        var storageKey = 'anime_' + type;
        // 'favorites' is also mirrored in the in-memory array for instant badge updates
        var savedList  = (type === 'favorites')
          ? favoriteAnime
          : (JSON.parse(localStorage.getItem(storageKey)) || []);

        // Update global state so the detail page knows which array to look at
        currentAnimeData = savedList;

        if (savedList.length === 0) {
          var labelMap = {
            favorites: 'Favorites',
            planning:  'Planning',
            watching:  'Watching',
            completed: 'Completed'
          };
          if (grid) grid.innerHTML =
            '<p style="color:var(--text-secondary);padding:2rem;grid-column:1/-1;text-align:center;">'
            + 'Your ' + (labelMap[type] || type) + ' list is empty. Go find some anime!'
            + '</p>';
        } else {
          renderGrid(savedList, false);
        }

        var localTarget = document.getElementById('library-grid');
        if (localTarget) localTarget.scrollIntoView({ behavior: 'smooth' });
        return; // skip API fetch
      }

      // ── API tabs: restore Load More, fetch as normal ────────────
      if (loadMoreWrap) loadMoreWrap.style.display = '';

      // Reset pagination state for this tab's source
      currentPage   = 1;
      currentApiUrl = tab.dataset.type === 'ongoing' ? ONGOING_URL : TOP_URL;

      if (grid) {
        grid.innerHTML = '<p style="color:var(--text-secondary);padding:2rem;grid-column:1/-1;text-align:center;">Loading…</p>';
      }

      try {
        var response = await fetch(currentApiUrl);
        if (!response.ok) throw new Error('Tab fetch error: ' + response.status);
        var json = await response.json();
        renderGrid(json.data, false);
      } catch (err) {
        console.warn('Category tab fetch failed:', err.message);
        if (grid) {
          grid.innerHTML = '<p style="color:var(--text-secondary);padding:2rem;grid-column:1/-1;text-align:center;">Failed to load. Please try again.</p>';
        }
      }

      var target = document.getElementById('library-grid');
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // NOTE: The standalone favorites tab fallback below is no longer needed
  // because tab-favorites now carries the category-tab class and is handled above.

  /* ----------------------------------------------------------
     LOAD MORE — appends the next page of the current source
  ---------------------------------------------------------- */

  var loadMoreBtn = document.getElementById('load-more-btn');

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async function () {
      currentPage++;

      // Temporarily update button label
      loadMoreBtn.textContent = 'Loading…';
      loadMoreBtn.disabled    = true;

      try {
        var url      = currentApiUrl + '&page=' + currentPage;
        var response = await fetch(url);
        if (!response.ok) throw new Error('Load more error: ' + response.status);

        var json = await response.json();
        renderGrid(json.data, true);

      } catch (err) {
        console.warn('Load more failed:', err.message);
        currentPage--; // roll back so the user can retry
      }

      // Restore button
      loadMoreBtn.innerHTML = 'Load More <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:7px"><polyline points="6 9 12 15 18 9"/></svg>';
      loadMoreBtn.disabled  = false;
    });
  }

  /* ----------------------------------------------------------
     FILTER BAR — genre, year, format dropdowns
  ---------------------------------------------------------- */

  /**
   * Reads the three filter dropdowns, builds a Jikan query URL,
   * resets pagination state, and renders fresh results.
   */
  async function applyFilters() {
    var genreValue  = document.getElementById('genre-filter').value;
    var yearValue   = document.getElementById('year-filter').value;
    var formatValue = document.getElementById('format-filter').value;

    var filterUrl = 'https://api.jikan.moe/v4/anime?sfw=true&limit=8&order_by=score&sort=desc';

    if (formatValue) {
      filterUrl += '&type=' + formatValue;
    }

    if (yearValue) {
      filterUrl += '&start_date=' + yearValue + '-01-01&end_date=' + yearValue + '-12-31';
    }

    if (genreValue) {
      var genreId = genreMap[genreValue];
      if (genreId) {
        filterUrl += '&genres=' + genreId;
      }
    }

    // Reset global pagination state to this new filtered source
    currentPage   = 1;
    currentApiUrl = filterUrl;

    // Show loading feedback
    var grid = document.getElementById('library-grid');
    if (grid) {
      grid.innerHTML = '<p style="color:var(--text-secondary);padding:2rem;grid-column:1/-1;text-align:center;">Loading…</p>';
    }

    try {
      var response = await fetch(filterUrl);
      if (!response.ok) throw new Error('Filter error: ' + response.status);
      var json = await response.json();
      renderGrid(json.data, false);
    } catch (err) {
      console.warn('applyFilters failed:', err.message);
      if (grid) {
        grid.innerHTML = '<p style="color:var(--text-secondary);padding:2rem;grid-column:1/-1;text-align:center;">Filter failed. Please try again.</p>';
      }
    }

    // Scroll the grid into view
    var target = document.getElementById('library-grid');
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  }

  // Wire up change listeners — grid updates the instant a dropdown changes
  ['genre-filter', 'year-filter', 'format-filter'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', applyFilters);
  });

  /* ----------------------------------------------------------
     LANGUAGE TOGGLE — EN / RU
  ---------------------------------------------------------- */

  var translations = {
    en: {
      searchPlaceholder: 'Search anime...',
      home:              'Home',
      topRating:         'Top Rating',
      ongoing:           'Ongoing',
      currentlyWatching: 'Currently Watching',
      featuredArtist:    'Featured Artist Studio',
      loadMore:          'Load More',
      watch:             'Watch',
      login:             'Login',
      changeBg:          'Change Background',
      // Format dropdown
      formatDefault:     'All Formats',
      formatTv:          'TV Show',
      formatMovie:       'Movie',
      formatOva:         'OVA',
      formatOna:         'ONA',
      formatSpecial:     'Special',
      // Year dropdown
      yearDefault:       'All Years',
      // Genre dropdown
      genreDefault:      'All Genres',
      genreAction:       'Action',
      genreAdventure:    'Adventure',
      genreComedy:       'Comedy',
      genreDrama:        'Drama',
      genreFantasy:      'Fantasy',
      genreHorror:       'Horror',
      genreMecha:        'Mecha',
      genreMystery:      'Mystery',
      genreRomance:      'Romance',
      genreSciFi:        'Sci-Fi',
      genreSlice:        'Slice of Life',
      genreSports:       'Sports',
      genreSupernatural: 'Supernatural',
      genreThriller:     'Thriller',
      // Sort dropdown
      sortBy:            'Sort By',
      sortRating:        'Rating',
      sortTitle:         'Title (A–Z)',
      sortNewest:        'Newest'
    },
    ru: {
      searchPlaceholder: 'Поиск аниме...',
      home:              'Главная',
      topRating:         'Топ Рейтинг',
      ongoing:           'Онгоинг',
      currentlyWatching: 'Смотрю сейчас',
      featuredArtist:    'Студия Избранного Художника',
      loadMore:          'Загрузить ещё',
      watch:             'Смотреть',
      login:             'Войти',
      changeBg:          'Изменить фон',
      // Format dropdown
      formatDefault:     'Все форматы',
      formatTv:          'ТВ Сериал',
      formatMovie:       'Фильм',
      formatOva:         'OVA',
      formatOna:         'ONA',
      formatSpecial:     'Спешл',
      // Year dropdown
      yearDefault:       'Все годы',
      // Genre dropdown
      genreDefault:      'Все жанры',
      genreAction:       'Экшен',
      genreAdventure:    'Приключения',
      genreComedy:       'Комедия',
      genreDrama:        'Драма',
      genreFantasy:      'Фэнтези',
      genreHorror:       'Хоррор',
      genreMecha:        'Меха',
      genreMystery:      'Тайна',
      genreRomance:      'Романтика',
      genreSciFi:        'Фантастика',
      genreSlice:        'Повседневность',
      genreSports:       'Спорт',
      genreSupernatural: 'Сверхъестественное',
      genreThriller:     'Триллер',
      // Sort dropdown
      sortBy:            'Сортировка',
      sortRating:        'Рейтинг',
      sortTitle:         'Название (А–Я)',
      sortNewest:        'Новейшее'
    }
  };

  var currentLang = 'en';

  /**
   * Applies the current language to every translatable element on the page.
   * Also re-renders the grid so Watch button labels update immediately.
   */
  function updateLanguage() {
    var t = translations[currentLang];

    // Search placeholder
    var sb = document.getElementById('search-bar');
    if (sb) sb.placeholder = t.searchPlaceholder;

    // Nav links
    var navHome = document.getElementById('nav-home');
    if (navHome) navHome.textContent = t.home;

    var navTop = document.getElementById('nav-top-rating');
    if (navTop) navTop.textContent = t.topRating;

    var navOngoing = document.getElementById('nav-ongoing');
    if (navOngoing) navOngoing.textContent = t.ongoing;

    // Category tabs
    var tabTop = document.getElementById('tab-top');
    if (tabTop) tabTop.textContent = t.topRating;

    var tabOngoing = document.getElementById('tab-ongoing');
    if (tabOngoing) tabOngoing.textContent = t.ongoing;

    // Section titles
    var cwTitle = document.querySelector('#currently-watching .section-title');
    if (cwTitle) cwTitle.textContent = t.currentlyWatching;

    var faTitle = document.querySelector('#featured-artist .section-title');
    if (faTitle) faTitle.textContent = t.featuredArtist;

    // Login button
    var loginBtn = document.getElementById('btn-login');
    if (loginBtn) loginBtn.textContent = t.login;

    // Change Background button — update only the text node, leave the SVG intact
    var changeBgBtn = document.getElementById('btn-change-bg');
    if (changeBgBtn) {
      // First child is the text node before the SVG
      var textNode = Array.from(changeBgBtn.childNodes).find(function (n) {
        return n.nodeType === Node.TEXT_NODE && n.nodeValue.trim();
      });
      if (textNode) textNode.nodeValue = ' ' + t.changeBg + ' ';
    }

    // Load More button (preserve the SVG arrow)
    var lmBtn = document.getElementById('load-more-btn');
    if (lmBtn) {
      lmBtn.innerHTML = t.loadMore + ' <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:7px"><polyline points="6 9 12 15 18 9"/></svg>';
    }

    // (Grid re-render happens at the very end of this function, after
    //  all dropdown translations are applied — see bottom of updateLanguage)

    // --- Format dropdown options (keyed by value attribute) ---
    var formatKeys = {
      '':        'formatDefault',
      'tv':      'formatTv',
      'movie':   'formatMovie',
      'ova':     'formatOva',
      'ona':     'formatOna',
      'special': 'formatSpecial'
    };
    var formatSelect = document.getElementById('format-filter');
    if (formatSelect) {
      Array.from(formatSelect.options).forEach(function (opt) {
        var key = formatKeys[opt.value];
        if (key && t[key]) opt.textContent = t[key];
      });
    }

    // --- Year dropdown — only the default option needs translation ---
    var yearSelect = document.getElementById('year-filter');
    if (yearSelect) {
      var yearDefault = yearSelect.querySelector('option[value=""]');
      if (yearDefault) yearDefault.textContent = t.yearDefault;
    }

    // --- Genre dropdown options (keyed by value attribute) ---
    var genreKeys = {
      '':             'genreDefault',
      'Action':       'genreAction',
      'Adventure':    'genreAdventure',
      'Comedy':       'genreComedy',
      'Drama':        'genreDrama',
      'Fantasy':      'genreFantasy',
      'Horror':       'genreHorror',
      'Mecha':        'genreMecha',
      'Mystery':      'genreMystery',
      'Romance':      'genreRomance',
      'Sci-Fi':       'genreSciFi',
      'Slice of Life':'genreSlice',
      'Sports':       'genreSports',
      'Supernatural': 'genreSupernatural',
      'Thriller':     'genreThriller'
    };
    var genreSelect = document.getElementById('genre-filter');
    if (genreSelect) {
      Array.from(genreSelect.options).forEach(function (opt) {
        var key = genreKeys[opt.value];
        if (key && t[key]) opt.textContent = t[key];
      });
    }

    // --- Sort dropdown options ---
    var sortKeys = {
      '':       'sortBy',
      'rating': 'sortRating',
      'title':  'sortTitle',
      'newest': 'sortNewest'
    };
    var sortSelect = document.getElementById('filter-sort');
    if (sortSelect) {
      Array.from(sortSelect.options).forEach(function (opt) {
        var key = sortKeys[opt.value];
        if (key && t[key]) opt.textContent = t[key];
      });
    }

    // Re-render the grid LAST so all UI strings (Watch button label, etc.)
    // are already updated before cards are rebuilt with localized titles.
    if (currentAnimeData && currentAnimeData.length > 0) {
      renderGrid(currentAnimeData, false);
    }
  }

  // Toggle handler
  var langToggleBtn = document.getElementById('lang-toggle');
  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', function () {
      currentLang = currentLang === 'en' ? 'ru' : 'en';
      langToggleBtn.textContent = currentLang === 'en' ? 'EN / RU' : 'RU / EN';
      updateLanguage();
    });
  }

  // Set initial language state on page load
  updateLanguage();

})();



/* ----------------------------------------------------------
   DETAIL PAGE — global scope
   openDetailPage toggles between the grid view and the
   full-page detail view, populating all metadata fields and
   loading the Anilibria player (YouTube trailer fallback).
---------------------------------------------------------- */

/**
 * Opens the full-page detail view for a given anime ID.
 * Hides the grid view, shows #detail-view, populates all
 * metadata fields, and loads the Anilibria player iframe.
 * @param {string|number} animeId - anime.mal_id
 */
async function openDetailPage(animeId) {
  var anime = currentAnimeData.find(function (a) { return a.mal_id === parseInt(animeId, 10); });
  if (!anime) return;
  currentOpenAnime = anime; // remember for the library dropdown

  // 1. Toggle Views
  document.getElementById('main-grid-view').classList.add('hidden');
  var libSection = document.getElementById('library-section');
  if (libSection) libSection.classList.add('hidden');
  document.getElementById('detail-view').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 2. Populate Data
  document.getElementById('detail-title').textContent =
    (typeof getLocalizedTitle === 'function') ? getLocalizedTitle(anime) : (anime.title || 'Unknown Title');
  document.getElementById('detail-rating').textContent   = (anime.score || 'N/A') + ' \u2605';
  document.getElementById('detail-episodes').textContent = (anime.episodes || '?') + ' EPISODES';
  document.getElementById('detail-status').textContent   = (anime.status || 'UNKNOWN').toUpperCase();

  document.getElementById('detail-type').textContent    = anime.type || 'N/A';
  document.getElementById('detail-season').textContent  = anime.season
    ? anime.season.charAt(0).toUpperCase() + anime.season.slice(1) : 'N/A';
  document.getElementById('detail-genres').textContent  =
    (anime.genres && anime.genres.length) ? anime.genres.map(function (g) { return g.name; }).join(' \u2022 ') : 'N/A';
  document.getElementById('detail-duration').textContent = anime.duration || 'N/A';

  document.getElementById('detail-synopsis').textContent = anime.synopsis || 'No description available.';

  // 3. Load Anilibria Player
  var iframe = document.getElementById('detail-video-iframe');
  iframe.src = ''; // clear previous

  try {
    var cleanTitle = (anime.title || '')
      .replace(/[^a-zA-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    var res  = await fetch('https://api.anilibria.tv/v3/title/search?search=' + encodeURIComponent(cleanTitle) + '&limit=1');
    var data = await res.json();

    if (data.list && data.list.length > 0) {
      iframe.src = 'https://www.anilibria.tv/public/iframe.php?id=' + data.list[0].id;
    } else {
      iframe.src = (anime.trailer && anime.trailer.embed_url) ? anime.trailer.embed_url : '';
    }
  } catch (e) {
    console.error('Anilibria fetch error:', e);
    iframe.src = (anime.trailer && anime.trailer.embed_url) ? anime.trailer.embed_url : '';
  }
}

// Attach back button listener — shows the grid again and stops video
var backToGridBtn = document.getElementById('back-to-grid');
if (backToGridBtn) {
  backToGridBtn.addEventListener('click', function () {
    document.getElementById('detail-view').classList.add('hidden');
    document.getElementById('main-grid-view').classList.remove('hidden');
    var libSection = document.getElementById('library-section');
    if (libSection) libSection.classList.remove('hidden');
    document.getElementById('detail-video-iframe').src = ''; // Stop video audio
    // Close dropdown if open when navigating away
    var dd = document.getElementById('library-dropdown');
    if (dd) dd.classList.add('hidden');
  });
}

/* ----------------------------------------------------------
   LIBRARY DROPDOWN — ADD TO LIBRARY button on the detail page
   Toggles the neon dropdown, saves the current anime to the
   appropriate localStorage list, and shows brief confirmation.
---------------------------------------------------------- */

// Toggle dropdown open/close
var libBtn = document.getElementById('detail-lib-btn');
if (libBtn) {
  libBtn.addEventListener('click', function (e) {
    e.stopPropagation(); // prevent the document click handler from instantly closing it
    document.getElementById('library-dropdown').classList.toggle('hidden');
  });
}

// Close dropdown when clicking anywhere outside it
document.addEventListener('click', function () {
  var dropdown = document.getElementById('library-dropdown');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    dropdown.classList.add('hidden');
  }
});

// Handle a specific list selection
document.querySelectorAll('.dropdown-item').forEach(function (btn) {
  btn.addEventListener('click', function (e) {
    e.stopPropagation(); // don't let this bubble up to the document close handler
    if (!currentOpenAnime) return;

    var listName   = e.currentTarget.getAttribute('data-list'); // 'favorites', 'planning', etc.
    var storageKey = 'anime_' + listName;

    // Load existing list from localStorage
    var listArray = JSON.parse(localStorage.getItem(storageKey)) || [];

    // Guard against duplicates
    var exists = listArray.some(function (a) { return a.mal_id === currentOpenAnime.mal_id; });

    if (!exists) {
      listArray.push(currentOpenAnime);
      localStorage.setItem(storageKey, JSON.stringify(listArray));

      // Also sync the in-memory favoriteAnime array so the grid badge updates instantly
      if (listName === 'favorites') {
        favoriteAnime = listArray;
      }

      // Visual feedback: temporarily update button label, then restore
      var mainBtn      = document.getElementById('detail-lib-btn');
      var originalHTML = mainBtn.innerHTML;
      mainBtn.innerHTML = '<span class="icon">✓</span> SAVED TO ' + listName.toUpperCase();
      setTimeout(function () { mainBtn.innerHTML = originalHTML; }, 2000);
    } else {
      // Gentle feedback instead of a blocking alert
      var mainBtn      = document.getElementById('detail-lib-btn');
      var originalHTML = mainBtn.innerHTML;
      mainBtn.innerHTML = '<span class="icon">⚠</span> ALREADY IN ' + listName.toUpperCase();
      setTimeout(function () { mainBtn.innerHTML = originalHTML; }, 2000);
    }

    // Close the dropdown after selection
    document.getElementById('library-dropdown').classList.add('hidden');
  });
});
