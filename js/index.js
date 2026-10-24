/* ============================================================
   Pokédex · datos de PokéAPI (https://pokeapi.co)
   ============================================================ */
(() => {
    'use strict';

    /* ------------------------------------------------------------
       Constantes
       ------------------------------------------------------------ */
    const API = 'https://pokeapi.co/api/v2';
    const IMG = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
    const ART = (id) => `${IMG}/other/official-artwork/${id}.png`;
    const ART_SHINY = (id) => `${IMG}/other/official-artwork/shiny/${id}.png`;
    const SPRITE = (id) => `${IMG}/${id}.png`;
    const TOTAL = 1025;
    const LOTE = 36;

    const TIPOS = {
        normal: ['Normal', '#A8A77A'], fire: ['Fuego', '#EE8130'], water: ['Agua', '#6390F0'],
        electric: ['Eléctrico', '#F7D02C'], grass: ['Planta', '#7AC74C'], ice: ['Hielo', '#96D9D6'],
        fighting: ['Lucha', '#C22E28'], poison: ['Veneno', '#A33EA1'], ground: ['Tierra', '#E2BF65'],
        flying: ['Volador', '#A98FF3'], psychic: ['Psíquico', '#F95587'], bug: ['Bicho', '#A6B91A'],
        rock: ['Roca', '#B6A136'], ghost: ['Fantasma', '#735797'], dragon: ['Dragón', '#6F35FC'],
        dark: ['Siniestro', '#705746'], steel: ['Acero', '#B7B7CE'], fairy: ['Hada', '#D685AD']
    };

    const STATS = {
        hp: 'PS', attack: 'Ataque', defense: 'Defensa',
        'special-attack': 'At. Esp.', 'special-defense': 'Def. Esp.', speed: 'Velocidad'
    };

    const CLASES = {
        physical: ['Físico', '💥'], special: ['Especial', '✨'], status: ['Estado', '🌀']
    };

    const GENS = {
        1: [1, 151], 2: [152, 251], 3: [252, 386], 4: [387, 493], 5: [494, 649],
        6: [650, 721], 7: [722, 809], 8: [810, 905], 9: [906, 1025]
    };

    /* Orden cronológico de los juegos, para elegir el set de movimientos más reciente */
    const ORDEN_VG = [
        'red-blue', 'yellow', 'gold-silver', 'crystal', 'ruby-sapphire', 'emerald', 'firered-leafgreen',
        'diamond-pearl', 'platinum', 'heartgold-soulsilver', 'black-white', 'colosseum', 'xd', 'black-2-white-2',
        'x-y', 'omega-ruby-alpha-sapphire', 'sun-moon', 'ultra-sun-ultra-moon', 'lets-go-pikachu-lets-go-eevee',
        'sword-shield', 'the-isle-of-armor', 'the-crown-tundra', 'brilliant-diamond-and-shining-pearl',
        'legends-arceus', 'scarlet-violet', 'the-teal-mask', 'the-indigo-disk'
    ];

    /* ------------------------------------------------------------
       Utilidades
       ------------------------------------------------------------ */
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
    const pad3 = (n) => String(n).padStart(3, '0');
    const idDeUrl = (url) => parseInt((url.match(/\/(\d+)\/?$/) || [])[1], 10);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const bonito = (nombre) => {
        if (nombre === 'nidoran-f') return 'Nidoran ♀';
        if (nombre === 'nidoran-m') return 'Nidoran ♂';
        return nombre.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };
    const colorTipo = (t) => (TIPOS[t] ? TIPOS[t][1] : '#888');
    const nombreTipo = (t) => (TIPOS[t] ? TIPOS[t][0] : bonito(t));
    const insignia = (t) => `<span class="tipo" style="--c:${colorTipo(t)}">${esc(nombreTipo(t))}</span>`;

    const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin storage */ } };
    const leer = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } };

    /* ------------------------------------------------------------
       Red: caché + reintentos + cola con límite de concurrencia
       ------------------------------------------------------------ */
    const cache = new Map();
    const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

    async function pedir(url, intentos = 3) {
        let ultimo;
        for (let i = 0; i < intentos; i++) {
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return await res.json();
            } catch (e) {
                ultimo = e;
                await esperar(400 * (i + 1));
            }
        }
        throw ultimo;
    }

    function api(ruta) {
        const url = ruta.startsWith('http') ? ruta : API + ruta;
        if (!cache.has(url)) {
            cache.set(url, pedir(url).catch((e) => { cache.delete(url); throw e; }));
        }
        return cache.get(url);
    }

    const cola = {
        activos: 0, max: 6, items: [],
        agregar(fn) {
            return new Promise((resolve, reject) => { this.items.push({ fn, resolve, reject }); this.siguiente(); });
        },
        siguiente() {
            while (this.activos < this.max && this.items.length) {
                const { fn, resolve, reject } = this.items.shift();
                this.activos++;
                Promise.resolve().then(fn).then(resolve, reject).finally(() => { this.activos--; this.siguiente(); });
            }
        },
        vaciar() { this.items = []; }
    };

    /* ------------------------------------------------------------
       Estado
       ------------------------------------------------------------ */
    const estado = {
        lista: [], filtrada: [], pintados: 0,
        gen: 'todas', tipo: null, tipoIds: null, busqueda: '', orden: 'num', soloFavs: false,
        favs: new Set(leer('pokedex:favs', []))
    };

    const grilla = $('#grilla');
    const centinela = $('#centinela');
    const txtEstado = $('#estado');

    /* ------------------------------------------------------------
       Navegación entre vistas
       ------------------------------------------------------------ */
    const vistas = { dex: $('#vistaDex'), juego: $('#vistaJuego'), aventura: $('#vistaAventura') };
    $$('.tab').forEach((b) => b.addEventListener('click', () => {
        const v = b.dataset.vista;
        $$('.tab').forEach((t) => t.classList.toggle('activa', t === b));
        Object.entries(vistas).forEach(([k, el]) => { el.hidden = k !== v; });
        if (v !== 'juego') juego.salir();
        if (v === 'aventura') aventura.entrar();
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    }));

    /* ------------------------------------------------------------
       Lista, filtros y grilla
       ------------------------------------------------------------ */
    async function cargarLista() {
        txtEstado.textContent = 'Cargando Pokédex…';
        try {
            const data = await api(`/pokemon?limit=${TOTAL}`);
            estado.lista = data.results
                .map((p) => ({ id: idDeUrl(p.url), name: p.name }))
                .filter((p) => p.id && p.id <= TOTAL);
            aplicarFiltros();
            const hash = parseInt(location.hash.replace('#', ''), 10);
            if (hash >= 1 && hash <= TOTAL) abrir(hash, false);
        } catch (e) {
            console.error('Error al cargar PokéAPI:', e);
            const detalle = (e && e.message ? e.message : 'sin conexión').replace(/</g, '&lt;');
            txtEstado.innerHTML = 'No se pudo cargar la Pokédex (' + detalle + '). Revisá tu conexión o si un bloqueador de anuncios/VPN bloquea pokeapi.co. <button class="reintentar" type="button">Reintentar</button>';
            $('.reintentar', txtEstado).addEventListener('click', cargarLista);
        }
    }

    function aplicarFiltros() {
        let r = estado.lista;
        if (estado.gen !== 'todas') {
            const [a, b] = GENS[estado.gen];
            r = r.filter((p) => p.id >= a && p.id <= b);
        }
        if (estado.tipoIds) r = r.filter((p) => estado.tipoIds.has(p.id));
        if (estado.soloFavs) r = r.filter((p) => estado.favs.has(p.id));
        const q = estado.busqueda.trim().toLowerCase().replace(/^#/, '');
        if (q) {
            r = /^\d+$/.test(q)
                ? r.filter((p) => String(p.id).startsWith(q) || pad3(p.id).startsWith(q))
                : r.filter((p) => p.name.includes(q) || bonito(p.name).toLowerCase().includes(q));
        }
        r = r.slice();
        if (estado.orden === 'az') r.sort((a, b) => a.name.localeCompare(b.name));
        else if (estado.orden === 'za') r.sort((a, b) => b.name.localeCompare(a.name));
        else r.sort((a, b) => a.id - b.id);
        estado.filtrada = r;
        reiniciarGrilla();
    }

    function reiniciarGrilla() {
        cola.vaciar();
        grilla.innerHTML = '';
        estado.pintados = 0;
        const n = estado.filtrada.length;
        txtEstado.textContent = n
            ? `${n} Pokémon`
            : (estado.soloFavs ? 'Todavía no marcaste favoritos. Tocá el ♥ de cualquier Pokémon.' : 'No se encontraron Pokémon con esos filtros.');
        pintarLote();
    }

    function pintarLote() {
        const fin = Math.min(estado.pintados + LOTE, estado.filtrada.length);
        const frag = document.createDocumentFragment();
        for (let i = estado.pintados; i < fin; i++) frag.appendChild(crearCard(estado.filtrada[i], i - estado.pintados));
        grilla.appendChild(frag);
        estado.pintados = fin;
    }

    function crearCard(p, i) {
        const el = document.createElement('article');
        el.className = 'card';
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', `${bonito(p.name)}, número ${p.id}`);
        el.dataset.id = p.id;
        el.style.setProperty('--d', (i % 12) * 35 + 'ms');
        const fav = estado.favs.has(p.id);
        el.innerHTML = `
            <button class="fav ${fav ? 'on' : ''}" type="button" aria-label="Marcar favorito" aria-pressed="${fav}">♥</button>
            <span class="num">#${pad3(p.id)}</span>
            <div class="img-wrap"><img alt="${esc(bonito(p.name))}" width="475" height="475" loading="lazy" src="${ART(p.id)}"></div>
            <h3>${esc(bonito(p.name))}</h3>
            <div class="tipos"></div>`;
        const img = $('img', el);
        img.addEventListener('load', () => img.classList.add('lista'));
        img.addEventListener('error', () => {
            if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = SPRITE(p.id); } else img.classList.add('lista');
        });
        cola.agregar(() => (el.isConnected ? api('/pokemon/' + p.id) : null)).then((d) => {
            if (!d) return;
            const tipos = d.types.map((t) => t.type.name);
            $('.tipos', el).innerHTML = tipos.map(insignia).join('');
            el.style.setProperty('--glow', colorTipo(tipos[0]));
        }).catch(() => { /* la card sigue funcionando sin tipos */ });
        return el;
    }

    new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && estado.pintados < estado.filtrada.length) pintarLote();
    }, { rootMargin: '600px 0px' }).observe(centinela);

    grilla.addEventListener('click', (e) => {
        const card = e.target.closest('.card');
        if (!card) return;
        const id = Number(card.dataset.id);
        if (e.target.closest('.fav')) { alternarFav(id); return; }
        abrir(id);
    });
    grilla.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card')) {
            e.preventDefault();
            abrir(Number(e.target.dataset.id));
        }
    });

    /* Favoritos */
    const cantFavs = $('#cantFavs');
    function actualizarFavs() { cantFavs.textContent = estado.favs.size; guardar('pokedex:favs', [...estado.favs]); }
    function alternarFav(id) {
        if (estado.favs.has(id)) estado.favs.delete(id); else estado.favs.add(id);
        actualizarFavs();
        const on = estado.favs.has(id);
        $$(`[data-id="${id}"] .fav, .m-fav[data-id="${id}"]`).forEach((b) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
        if (estado.soloFavs) aplicarFiltros();
    }
    actualizarFavs();

    /* Controles */
    let tBusca;
    $('#buscar').addEventListener('input', (e) => {
        clearTimeout(tBusca);
        tBusca = setTimeout(() => { estado.busqueda = e.target.value; aplicarFiltros(); }, 220);
    });
    $('#selGen').addEventListener('change', (e) => { estado.gen = e.target.value; aplicarFiltros(); });
    $('#selOrden').addEventListener('change', (e) => { estado.orden = e.target.value; aplicarFiltros(); });
    $('#btnFavs').addEventListener('click', (e) => {
        estado.soloFavs = !estado.soloFavs;
        e.currentTarget.classList.toggle('on', estado.soloFavs);
        e.currentTarget.setAttribute('aria-pressed', estado.soloFavs);
        aplicarFiltros();
    });

    const chips = $('#chipsTipos');
    chips.innerHTML = '<button class="chip activa" type="button" data-tipo="">Todos</button>' +
        Object.keys(TIPOS).map((t) => `<button class="chip" type="button" data-tipo="${t}" style="--c:${colorTipo(t)}">${esc(nombreTipo(t))}</button>`).join('');
    chips.addEventListener('click', async (e) => {
        const b = e.target.closest('.chip');
        if (!b) return;
        const t = b.dataset.tipo || null;
        $$('.chip', chips).forEach((c) => c.classList.toggle('activa', c === b));
        estado.tipo = t;
        if (!t) { estado.tipoIds = null; aplicarFiltros(); return; }
        txtEstado.textContent = 'Filtrando…';
        try {
            const d = await api('/type/' + t);
            if (estado.tipo !== t) return;
            estado.tipoIds = new Set(d.pokemon.map((x) => idDeUrl(x.pokemon.url)).filter((id) => id <= TOTAL));
            aplicarFiltros();
        } catch (err) {
            txtEstado.textContent = 'No se pudo filtrar por tipo. Probá de nuevo.';
        }
    });

    /* ------------------------------------------------------------
       Detalle (modal)
       ------------------------------------------------------------ */
    const modal = $('#modal');
    const contenido = $('#mContenido');
    let modalId = null;
    let modalToken = 0;
    let ultimoFoco = null;
    let audio = null;

    function cerrar() {
        modal.hidden = true;
        document.body.classList.remove('bloqueado');
        modalId = null;
        modalToken++;
        if (audio) { audio.pause(); audio = null; }
        history.replaceState(null, '', location.pathname + location.search);
        if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
    }

    modal.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) cerrar(); });
    $('.m-nav.prev', modal).addEventListener('click', () => modalId && abrir(modalId === 1 ? TOTAL : modalId - 1));
    $('.m-nav.next', modal).addEventListener('click', () => modalId && abrir(modalId === TOTAL ? 1 : modalId + 1));
    document.addEventListener('keydown', (e) => {
        if (modal.hidden) return;
        if (e.key === 'Escape') cerrar();
        else if (e.key === 'ArrowLeft') $('.m-nav.prev', modal).click();
        else if (e.key === 'ArrowRight') $('.m-nav.next', modal).click();
    });

    async function abrir(id, empujar = true) {
        if (modal.hidden) ultimoFoco = document.activeElement;
        modalId = id;
        const token = ++modalToken;
        modal.hidden = false;
        document.body.classList.add('bloqueado');
        if (audio) { audio.pause(); audio = null; }
        if (empujar) history.replaceState(null, '', '#' + id);
        contenido.innerHTML = `<div class="m-cargando"><span class="pokebola girando" aria-hidden="true"></span><p>Cargando #${pad3(id)}…</p></div>`;
        $('.modal-caja', modal).scrollTop = 0;
        try {
            const [p, sp] = await Promise.all([api('/pokemon/' + id), api('/pokemon-species/' + id)]);
            if (token !== modalToken) return;
            pintarModal(p, sp);
            cargarEvoluciones(p, sp, token);
            cargarDebilidades(p, token);
            cargarHabilidades(p, token);
            prepararMovimientos(p, token);
        } catch (e) {
            if (token !== modalToken) return;
            contenido.innerHTML = '<div class="m-cargando"><p>No se pudo cargar este Pokémon.</p><button class="btn-sec reintentar" type="button">Reintentar</button></div>';
            $('.reintentar', contenido).addEventListener('click', () => abrir(id, false));
        }
    }

    const textoEs = (lista, campo) => {
        const it = (lista || []).filter((x) => x.language && x.language.name === 'es');
        return it.length ? it[it.length - 1][campo] : '';
    };

    function pintarModal(p, sp) {
        const tipos = p.types.map((t) => t.type.name);
        const c1 = colorTipo(tipos[0]);
        const c2 = colorTipo(tipos[1] || tipos[0]);
        const genero = textoEs(sp.genera, 'genus');
        const descripcion = textoEs(sp.flavor_text_entries, 'flavor_text').replace(/[\n\f\r]/g, ' ');
        const total = p.stats.reduce((a, s) => a + s.base_stat, 0);
        const fav = estado.favs.has(p.id);

        contenido.innerHTML = `
        <div class="m-hero" style="--c1:${c1};--c2:${c2}">
            <div class="m-hero-txt">
                <span class="m-num">#${pad3(p.id)}</span>
                <h2 id="mTitulo">${esc(bonito(p.name))}</h2>
                <p class="m-genero">${esc(genero)}${sp.is_legendary ? ' · Legendario' : ''}${sp.is_mythical ? ' · Singular' : ''}</p>
                <div class="tipos">${tipos.map(insignia).join('')}</div>
                <div class="m-acciones">
                    <button class="m-fav ${fav ? 'on' : ''}" data-id="${p.id}" type="button" aria-pressed="${fav}">♥ Favorito</button>
                    <button id="btnShiny" type="button" aria-pressed="false">✨ Shiny</button>
                    ${p.cries && p.cries.latest ? '<button id="btnGrito" type="button">🔊 Grito</button>' : ''}
                </div>
            </div>
            <div class="m-art"><img id="mImg" src="${ART(p.id)}" alt="${esc(bonito(p.name))}"></div>
        </div>

        <div class="m-cuerpo">
            ${descripcion ? `<p class="m-desc">${esc(descripcion)}</p>` : ''}
            <div class="m-tabs" role="tablist">
                <button class="m-tab activa" role="tab" type="button" data-panel="pInfo">Información</button>
                <button class="m-tab" role="tab" type="button" data-panel="pEvos">Evoluciones</button>
                <button class="m-tab" role="tab" type="button" data-panel="pMovs">Movimientos</button>
            </div>

            <div class="m-panel activo" id="pInfo">
                <div class="m-datos">
                    <div><small>Altura</small><b>${(p.height / 10).toFixed(1)} m</b></div>
                    <div><small>Peso</small><b>${(p.weight / 10).toFixed(1)} kg</b></div>
                    <div><small>Exp. base</small><b>${p.base_experience || '—'}</b></div>
                </div>
                <h3>Habilidades</h3>
                <div class="habilidades" id="mHab">${p.abilities.map((a) => `<span class="hab">${esc(bonito(a.ability.name))}${a.is_hidden ? ' <em>oculta</em>' : ''}</span>`).join('')}</div>
                <h3>Estadísticas base</h3>
                <div class="stats">
                    ${p.stats.map((s) => {
                        const pct = Math.min(100, Math.round((s.base_stat / 200) * 100));
                        const col = s.base_stat >= 110 ? '#22c55e' : s.base_stat >= 70 ? '#eab308' : '#ef4444';
                        return `<div class="stat"><span>${STATS[s.stat.name] || bonito(s.stat.name)}</span><b>${s.base_stat}</b>
                            <div class="barra"><i style="--w:${pct}%;--col:${col}"></i></div></div>`;
                    }).join('')}
                    <div class="stat total"><span>Total</span><b>${total}</b><div></div></div>
                </div>
                <h3>Debilidades y resistencias</h3>
                <div id="mDebil"><p class="vacio">Calculando…</p></div>
            </div>

            <div class="m-panel" id="pEvos"><div id="mEvos"><p class="vacio">Cargando evoluciones…</p></div></div>
            <div class="m-panel" id="pMovs"><div id="mMovs"><p class="vacio">Cargando movimientos…</p></div></div>
        </div>`;

        requestAnimationFrame(() => requestAnimationFrame(() => $$('.barra i', contenido).forEach((i) => i.classList.add('llena'))));

        $$('.m-tab', contenido).forEach((t) => t.addEventListener('click', () => {
            $$('.m-tab', contenido).forEach((x) => x.classList.toggle('activa', x === t));
            $$('.m-panel', contenido).forEach((pn) => pn.classList.toggle('activo', pn.id === t.dataset.panel));
        }));
        $('.m-fav', contenido).addEventListener('click', () => alternarFav(p.id));

        const img = $('#mImg', contenido);
        $('#btnShiny', contenido).addEventListener('click', (e) => {
            const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
            e.currentTarget.setAttribute('aria-pressed', on);
            e.currentTarget.classList.toggle('on', on);
            img.src = on ? ART_SHINY(p.id) : ART(p.id);
        });
        const bg = $('#btnGrito', contenido);
        if (bg) bg.addEventListener('click', () => {
            if (audio) audio.pause();
            audio = new Audio(p.cries.latest);
            audio.volume = .45;
            audio.play().catch(() => { /* el navegador puede bloquear el audio */ });
        });
    }

    /* Habilidades en español */
    async function cargarHabilidades(p, token) {
        const cont = $('#mHab', contenido);
        if (!cont) return;
        try {
            const datos = await Promise.all(p.abilities.map((a) => api(a.ability.url)));
            if (token !== modalToken) return;
            cont.innerHTML = p.abilities.map((a, i) => {
                const n = textoEs(datos[i].names, 'name') || bonito(a.ability.name);
                const d = textoEs(datos[i].flavor_text_entries, 'flavor_text').replace(/[\n\f\r]/g, ' ');
                return `<span class="hab" ${d ? `title="${esc(d)}"` : ''}>${esc(n)}${a.is_hidden ? ' <em>oculta</em>' : ''}</span>`;
            }).join('');
        } catch (e) { /* se mantienen los nombres en inglés */ }
    }

    /* Debilidades */
    async function cargarDebilidades(p, token) {
        const cont = $('#mDebil', contenido);
        if (!cont) return;
        try {
            const tipos = p.types.map((t) => t.type.name);
            const datos = await Promise.all(tipos.map((t) => api('/type/' + t)));
            if (token !== modalToken) return;
            const mult = {};
            Object.keys(TIPOS).forEach((t) => { mult[t] = 1; });
            datos.forEach((d) => {
                const r = d.damage_relations;
                r.double_damage_from.forEach((x) => { if (x.name in mult) mult[x.name] *= 2; });
                r.half_damage_from.forEach((x) => { if (x.name in mult) mult[x.name] *= 0.5; });
                r.no_damage_from.forEach((x) => { if (x.name in mult) mult[x.name] *= 0; });
            });
            const grupo = (titulo, filtro, fmt) => {
                const l = Object.keys(mult).filter((t) => filtro(mult[t]));
                return l.length ? `<div class="debil-fila"><span class="debil-t">${titulo}</span><div>${l.map((t) => `<span class="tipo" style="--c:${colorTipo(t)}">${esc(nombreTipo(t))} <i>${fmt(mult[t])}</i></span>`).join('')}</div></div>` : '';
            };
            cont.innerHTML =
                grupo('Débil a', (m) => m > 1, (m) => '×' + m) +
                grupo('Resiste', (m) => m < 1 && m > 0, (m) => (m === 0.5 ? '×½' : '×¼')) +
                grupo('Inmune a', (m) => m === 0, () => '×0') || '<p class="vacio">Sin datos.</p>';
        } catch (e) { cont.innerHTML = '<p class="vacio">No se pudieron calcular.</p>'; }
    }

    /* Evoluciones */
    const limpiar = (s) => bonito(String(s));
    function condicionEvo(detalles) {
        if (!detalles || !detalles.length) return '';
        const textos = detalles.slice(0, 2).map((d) => {
            const partes = [];
            if (d.min_level) partes.push('Nivel ' + d.min_level);
            if (d.item) partes.push('Usar ' + limpiar(d.item.name));
            if (d.held_item) partes.push('Con ' + limpiar(d.held_item.name));
            if (d.trigger && d.trigger.name === 'trade') partes.push('Intercambio');
            if (d.min_happiness) partes.push('Felicidad ≥ ' + d.min_happiness);
            if (d.min_affection) partes.push('Afecto ≥ ' + d.min_affection);
            if (d.min_beauty) partes.push('Belleza ≥ ' + d.min_beauty);
            if (d.time_of_day) partes.push(d.time_of_day === 'day' ? 'De día' : d.time_of_day === 'night' ? 'De noche' : 'Al ' + d.time_of_day);
            if (d.known_move) partes.push('Conociendo ' + limpiar(d.known_move.name));
            if (d.known_move_type) partes.push('Mov. tipo ' + nombreTipo(d.known_move_type.name));
            if (d.location) partes.push('En ' + limpiar(d.location.name));
            if (d.needs_overworld_rain) partes.push('Con lluvia');
            if (d.turn_upside_down) partes.push('Consola al revés');
            if (d.party_species) partes.push('Con ' + limpiar(d.party_species.name) + ' en el equipo');
            if (d.gender === 1) partes.push('Hembra');
            if (d.gender === 2) partes.push('Macho');
            if (typeof d.relative_physical_stats === 'number') {
                partes.push(d.relative_physical_stats > 0 ? 'Ataque > Defensa' : d.relative_physical_stats < 0 ? 'Ataque < Defensa' : 'Ataque = Defensa');
            }
            if (!partes.length) {
                const t = d.trigger && d.trigger.name;
                partes.push(t === 'level-up' ? 'Subir de nivel' : t === 'use-item' ? 'Usar objeto' : t === 'trade' ? 'Intercambio' : 'Condición especial');
            }
            return partes.join(' · ');
        });
        return [...new Set(textos)].join(' / ');
    }

    function nodoEvo(nodo, actual) {
        const id = idDeUrl(nodo.species.url);
        const hijos = nodo.evolves_to.map((h) =>
            `<div class="evo-par"><div class="evo-flecha"><span>${esc(condicionEvo(h.evolution_details))}</span><i aria-hidden="true">➜</i></div>${nodoEvo(h, actual)}</div>`
        ).join('');
        return `<div class="evo-rama">
            <button class="evo-nodo ${id === actual ? 'actual' : ''}" type="button" data-id="${id}" ${id > TOTAL ? 'disabled' : ''}>
                <img src="${ART(id)}" alt="" loading="lazy"><span>#${pad3(id)}</span><b>${esc(bonito(nodo.species.name))}</b>
            </button>
            ${hijos ? `<div class="evo-hijos">${hijos}</div>` : ''}
        </div>`;
    }

    async function cargarEvoluciones(p, sp, token) {
        const cont = $('#mEvos', contenido);
        if (!cont) return;
        try {
            if (!sp.evolution_chain) { cont.innerHTML = '<p class="vacio">Este Pokémon no evoluciona.</p>'; return; }
            const ev = await api(sp.evolution_chain.url);
            if (token !== modalToken) return;
            if (!ev.chain.evolves_to.length) { cont.innerHTML = '<p class="vacio">Este Pokémon no evoluciona.</p>'; return; }
            cont.innerHTML = `<div class="evo-arbol">${nodoEvo(ev.chain, p.id)}</div>`;
            $$('.evo-nodo', cont).forEach((b) => b.addEventListener('click', () => {
                const id = Number(b.dataset.id);
                if (id !== p.id) abrir(id);
            }));
        } catch (e) { cont.innerHTML = '<p class="vacio">No se pudieron cargar las evoluciones.</p>'; }
    }

    /* Movimientos */
    const ordenVG = (n) => ORDEN_VG.indexOf(n);

    function movimientosPorNivel(p) {
        let mejor = -2;
        p.moves.forEach((m) => m.version_group_details.forEach((d) => {
            if (d.move_learn_method.name === 'level-up') mejor = Math.max(mejor, ordenVG(d.version_group.name));
        }));
        const lista = [];
        p.moves.forEach((m) => {
            const d = m.version_group_details.find((x) => x.move_learn_method.name === 'level-up' && ordenVG(x.version_group.name) === mejor);
            if (d) lista.push({ name: m.move.name, nivel: d.level_learned_at });
        });
        if (!lista.length) p.moves.slice(0, 60).forEach((m) => lista.push({ name: m.move.name, nivel: 0 }));
        return lista.sort((a, b) => a.nivel - b.nivel || a.name.localeCompare(b.name));
    }

    function prepararMovimientos(p, token) {
        const cont = $('#mMovs', contenido);
        if (!cont) return;
        const lista = movimientosPorNivel(p);
        if (!lista.length) { cont.innerHTML = '<p class="vacio">Sin movimientos registrados.</p>'; return; }
        const INICIAL = 14;
        let mostrados = 0;

        cont.innerHTML = `<div class="movs-cab"><span>Nv</span><span>Movimiento</span><span>Tipo</span><span>Clase</span><span>Poder</span><span>Prec.</span><span>PP</span></div>
            <div class="movs" id="movsLista"></div><div id="movsMas"></div>`;
        const ul = $('#movsLista', cont);
        const mas = $('#movsMas', cont);

        const agregarFilas = (hasta) => {
            const frag = document.createDocumentFragment();
            for (let i = mostrados; i < Math.min(hasta, lista.length); i++) {
                const m = lista[i];
                const fila = document.createElement('div');
                fila.className = 'mov';
                fila.innerHTML = `<span class="mv-n">${m.nivel ? m.nivel : '—'}</span><span class="mv-nom">${esc(bonito(m.name))}</span><span class="mv-t"></span><span class="mv-c"></span><span class="mv-p">…</span><span class="mv-a">…</span><span class="mv-pp">…</span>`;
                frag.appendChild(fila);
                cola.agregar(() => api('/move/' + m.name)).then((d) => {
                    if (token !== modalToken || !fila.isConnected) return;
                    const nom = textoEs(d.names, 'name');
                    if (nom) $('.mv-nom', fila).textContent = nom;
                    $('.mv-t', fila).innerHTML = insignia(d.type.name);
                    const cl = CLASES[d.damage_class && d.damage_class.name];
                    $('.mv-c', fila).innerHTML = cl ? `<span title="${cl[0]}">${cl[1]}</span>` : '—';
                    $('.mv-p', fila).textContent = d.power || '—';
                    $('.mv-a', fila).textContent = d.accuracy ? d.accuracy + '%' : '—';
                    $('.mv-pp', fila).textContent = d.pp || '—';
                }).catch(() => { $$('.mv-p,.mv-a,.mv-pp', fila).forEach((x) => { x.textContent = '—'; }); });
            }
            ul.appendChild(frag);
            mostrados = Math.min(hasta, lista.length);
            mas.innerHTML = mostrados < lista.length
                ? `<button class="btn-sec" type="button" id="btnMasMovs">Ver todos (${lista.length - mostrados} más)</button>` : '';
            const b = $('#btnMasMovs', mas);
            if (b) b.addEventListener('click', () => agregarFilas(lista.length));
        };
        agregarFilas(INICIAL);
    }

    /* ------------------------------------------------------------
       Juego: ¿Quién es ese Pokémon?
       ------------------------------------------------------------ */
    const juego = (() => {
        const $inicio = $('#juegoInicio');
        const $partida = $('#juegoPartida');
        const $fin = $('#juegoFin');
        const $img = $('#juegoImg');
        const $nombre = $('#juegoNombre');
        const $opc = $('#juegoOpciones');
        const $barra = $('#barraTiempo');
        const RONDAS = 10;
        const VIDAS = 3;
        const SEGUNDOS = 12;

        let s = null;
        let timer = null;
        let sonido = leer('pokedex:sonido', true);
        let record = leer('pokedex:record', 0);

        $('#juegoSonido').checked = sonido;
        $('#juegoSonido').addEventListener('change', (e) => { sonido = e.target.checked; guardar('pokedex:sonido', sonido); });
        const pintarRecord = () => { $('#recordInicio').textContent = record; $('#finRecord').textContent = record; };
        pintarRecord();

        const mostrar = (cual) => { $inicio.hidden = cual !== 'inicio'; $partida.hidden = cual !== 'partida'; $fin.hidden = cual !== 'fin'; };
        const aleatorio = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const mezclar = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

        const precargar = (url) => new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(url); i.onerror = mal; i.src = url; });

        function hud() {
            $('#hudRonda').textContent = `${Math.min(s.ronda + 1, RONDAS)}/${RONDAS}`;
            $('#hudPuntos').textContent = s.puntos;
            $('#hudRacha').textContent = s.racha;
            $('#hudVidas').textContent = '♥'.repeat(s.vidas) + '♡'.repeat(VIDAS - s.vidas);
        }

        function parar() { clearInterval(timer); timer = null; }

        async function comenzar() {
            if (!estado.lista.length) { return; }
            const g = $('#juegoGen').value;
            const [a, b] = g === 'todas' ? [1, TOTAL] : GENS[g];
            const pool = estado.lista.filter((p) => p.id >= a && p.id <= b);
            s = { pool, orden: mezclar(pool).slice(0, RONDAS + 6), ronda: 0, puntos: 0, vidas: VIDAS, racha: 0, mejorRacha: 0, aciertos: 0, bloqueado: true, actual: null, t0: 0 };
            mostrar('partida');
            hud();
            await ronda();
        }

        async function ronda() {
            parar();
            s.bloqueado = true;
            hud();
            $nombre.textContent = '';
            $nombre.classList.remove('ok', 'mal');
            $opc.innerHTML = '';
            $barra.style.transition = 'none';
            $barra.style.width = '100%';
            $img.classList.add('silueta');
            $img.classList.remove('revelado');

            let correcto;
            while (true) {
                correcto = s.orden.shift();
                if (!correcto) { fin(); return; }
                try { await precargar(ART(correcto.id)); break; } catch (e) { /* imagen caída: probar otro */ }
            }
            s.actual = correcto;
            $img.src = ART(correcto.id);
            $img.alt = 'Silueta de un Pokémon';

            const distractores = [];
            while (distractores.length < 3) {
                const c = aleatorio(s.pool);
                if (c.id !== correcto.id && !distractores.includes(c)) distractores.push(c);
            }
            const opciones = mezclar([correcto, ...distractores]);
            $opc.innerHTML = opciones.map((o, i) => `<button class="j-op" type="button" data-id="${o.id}"><kbd>${i + 1}</kbd>${esc(bonito(o.name))}</button>`).join('');

            s.bloqueado = false;
            s.t0 = performance.now();
            requestAnimationFrame(() => {
                $barra.style.transition = `width ${SEGUNDOS}s linear`;
                $barra.style.width = '0%';
            });
            timer = setInterval(() => {
                if ((performance.now() - s.t0) / 1000 >= SEGUNDOS) responder(null);
            }, 100);
        }

        function responder(id) {
            if (!s || s.bloqueado) return;
            s.bloqueado = true;
            parar();
            const seg = (performance.now() - s.t0) / 1000;
            const acierto = id === s.actual.id;
            const anchoActual = getComputedStyle($barra).width;
            $barra.style.transition = 'none';
            $barra.style.width = anchoActual;

            if (acierto) {
                s.racha++;
                s.mejorRacha = Math.max(s.mejorRacha, s.racha);
                s.aciertos++;
                const bonoTiempo = Math.max(0, Math.round((SEGUNDOS - seg) / SEGUNDOS * 50));
                const bonoRacha = Math.min(s.racha - 1, 5) * 10;
                s.puntos += 100 + bonoTiempo + bonoRacha;
            } else {
                s.racha = 0;
                s.vidas--;
            }

            $$('.j-op', $opc).forEach((b) => {
                b.disabled = true;
                const bid = Number(b.dataset.id);
                if (bid === s.actual.id) b.classList.add('correcta');
                else if (bid === id) b.classList.add('incorrecta');
            });
            $img.classList.remove('silueta');
            $img.classList.add('revelado');
            $img.alt = bonito(s.actual.name);
            $nombre.textContent = (acierto ? '¡Correcto! ' : id === null ? '¡Se acabó el tiempo! ' : '¡Incorrecto! ') + 'Es ' + bonito(s.actual.name);
            $nombre.classList.add(acierto ? 'ok' : 'mal');
            $('#escena').classList.remove('sacudir');
            if (!acierto) { void $('#escena').offsetWidth; $('#escena').classList.add('sacudir'); }
            s.ronda++;
            hud();

            if (sonido) {
                api('/pokemon/' + s.actual.id).then((d) => {
                    if (d.cries && d.cries.latest) { const a = new Audio(d.cries.latest); a.volume = .4; a.play().catch(() => {}); }
                }).catch(() => {});
            }
            setTimeout(() => {
                if (!s) return;
                if (s.vidas <= 0 || s.ronda >= RONDAS) fin(); else ronda();
            }, 1700);
        }

        function fin() {
            parar();
            const nuevo = s.puntos > record;
            if (nuevo) { record = s.puntos; guardar('pokedex:record', record); }
            pintarRecord();
            $('#finTitulo').textContent = s.vidas <= 0 ? 'Te quedaste sin vidas' : (s.aciertos >= 8 ? '¡Maestro Pokémon!' : '¡Fin del juego!');
            $('#finPuntos').textContent = s.puntos;
            $('#finDetalle').textContent = `Aciertos: ${s.aciertos} de ${Math.min(RONDAS, s.ronda)} · Mejor racha: ${s.mejorRacha}${nuevo && s.puntos > 0 ? ' · ¡Nuevo récord!' : ''}`;
            mostrar('fin');
        }

        function salir() { parar(); s = null; mostrar('inicio'); }

        $('#btnJugar').addEventListener('click', comenzar);
        $('#btnOtra').addEventListener('click', comenzar);
        $('#btnMenu').addEventListener('click', salir);
        $opc.addEventListener('click', (e) => {
            const b = e.target.closest('.j-op');
            if (b) responder(Number(b.dataset.id));
        });
        document.addEventListener('keydown', (e) => {
            if ($partida.hidden || !s || s.bloqueado) return;
            const n = parseInt(e.key, 10);
            if (n >= 1 && n <= 4) { const b = $$('.j-op', $opc)[n - 1]; if (b) responder(Number(b.dataset.id)); }
        });

        return { salir };
    })();

    /* ------------------------------------------------------------
       Aventura: encuentros, combate por turnos, captura y evolución
       ------------------------------------------------------------ */
    const aventura = (() => {
        const KEY = 'pokedex:aventura';
        const IV = 15;
        const MAX_EQUIPO = 6;
        const P_SHINY_INICIAL = 1 / 8;   // los iniciales también pueden salir shiny
        const INICIALES = {
            1: [[1, 'Bulbasaur'], [4, 'Charmander'], [7, 'Squirtle']],
            2: [[152, 'Chikorita'], [155, 'Cyndaquil'], [158, 'Totodile']],
            3: [[252, 'Treecko'], [255, 'Torchic'], [258, 'Mudkip']],
            4: [[387, 'Turtwig'], [390, 'Chimchar'], [393, 'Piplup']],
            5: [[495, 'Snivy'], [498, 'Tepig'], [501, 'Oshawott']],
            6: [[650, 'Chespin'], [653, 'Fennekin'], [656, 'Froakie']],
            7: [[722, 'Rowlet'], [725, 'Litten'], [728, 'Popplio']],
            8: [[810, 'Grookey'], [813, 'Scorbunny'], [816, 'Sobble']],
            9: [[906, 'Sprigatito'], [909, 'Fuecoco'], [912, 'Quaxly']],
            especial: [[25, 'Pikachu'], [133, 'Eevee']]
        };
        const ITEMS = {
            pokeball: ['Poké Ball', 1], superball: ['Super Ball', 1.5],
            pocion: ['Poción', 20], superpocion: ['Super Poción', 60]
        };
        const PROHIBIDOS = new Set([
            'self-destruct', 'explosion', 'misty-explosion', 'final-gambit', 'dream-eater', 'snore', 'sleep-talk',
            'sky-drop', 'focus-punch', 'last-resort', 'belch', 'steel-roller', 'fake-out', 'first-impression',
            'synchronoise', 'poltergeist', 'spit-up', 'counter', 'mirror-coat', 'metal-burst', 'bide', 'endeavor',
            'natural-gift', 'fling', 'trump-card', 'upper-hand', 'thunderclap', 'shell-trap', 'beak-blast',
            'sucker-punch', 'struggle', 'hyper-beam', 'giga-impact', 'doom-desire', 'future-sight'
        ]);
        const P_SHINY = 1 / 64;          // probabilidad shiny (encuentro normal)
        const P_SHINY_ALFA = 1 / 20;     // probabilidad shiny (Alfa)
        const P_LEGENDARIO = 1 / 30;     // probabilidad de que aparezca un legendario en cualquier escenario
        const LEGENDARIOS = [144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386,
            480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, 494, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649,
            716, 717, 718, 719, 720, 721, 785, 786, 787, 788, 789, 790, 791, 792, 800, 801, 802, 807, 808, 809,
            888, 889, 890, 891, 892, 893, 894, 895, 896, 897, 898, 1001, 1002, 1003, 1004, 1007, 1008, 1014, 1015, 1016, 1017, 1024, 1025];
        // Escenarios estilo aventura clásica: cada uno favorece ciertos tipos, cambia el fondo y ajusta el nivel
        const ESCENARIOS = {
            pasto:    { nombre: 'Hierba alta',   icono: '🌿', tipos: ['grass', 'normal', 'bug', 'flying', 'poison'],        nivel: 0, legend: 1 },
            bosque:   { nombre: 'Bosque',        icono: '🌲', tipos: ['grass', 'bug', 'poison', 'fairy', 'normal'],          nivel: 0, legend: 1 },
            costa:    { nombre: 'Costa y mar',   icono: '🌊', tipos: ['water', 'ice', 'flying', 'electric'],                 nivel: 1, legend: 1 },
            cueva:    { nombre: 'Cueva oscura',  icono: '🕳️', tipos: ['rock', 'ground', 'steel', 'poison', 'dark'],          nivel: 2, legend: 1.3 },
            montana:  { nombre: 'Montaña',       icono: '⛰️', tipos: ['rock', 'fighting', 'fire', 'dragon', 'flying'],       nivel: 3, legend: 1.5 },
            central:  { nombre: 'Central eléctrica', icono: '⚡', tipos: ['electric', 'steel', 'fire', 'fighting'],          nivel: 3, legend: 1.5 },
            ruinas:   { nombre: 'Ruinas antiguas', icono: '🏛️', tipos: ['ghost', 'psychic', 'dark', 'fairy', 'dragon'],      nivel: 4, legend: 2.5 }
        };
        // Campaña: 8 etapas de 10 combates; el combate 10 es contra el líder y da una medalla
        const COMBATES = 10;
        const DIFICULTADES = {
            facil:   { nombre: 'Fácil',      icono: '🟢', nivel: -2, shiny: 1 / 20, premio: 1,   desc: 'Rivales más débiles. Podés curar tu equipo cuando quieras. Si perdés, repetís el combate.' },
            medio:   { nombre: 'Intermedio', icono: '🟡', nivel: 0,  shiny: 1 / 14, premio: 1.5, desc: 'Rivales parejos. Solo curás gratis al empezar una etapa. Si perdés, reiniciás la etapa.' },
            dificil: { nombre: 'Difícil',    icono: '🔴', nivel: 5,  shiny: 1 / 8,  premio: 2,   desc: 'Rivales muy fuertes. Solo curás al empezar una etapa. Si perdés, reiniciás la etapa. Mejores premios y más shinys.' }
        };
        const ETAPAS = [
            { nombre: 'Sendero Verde',     esc: 'pasto',   tipo: 'grass',    lider: 'Líder Hoja',     medalla: 'Medalla Hoja',     ico: '🍃' },
            { nombre: 'Bosque Espeso',     esc: 'bosque',  tipo: 'bug',      lider: 'Líder Escarabajo', medalla: 'Medalla Insecto', ico: '🐛' },
            { nombre: 'Costa Brava',       esc: 'costa',   tipo: 'water',    lider: 'Líder Marea',    medalla: 'Medalla Gota',     ico: '💧' },
            { nombre: 'Cueva Profunda',    esc: 'cueva',   tipo: 'rock',     lider: 'Líder Roca',     medalla: 'Medalla Piedra',   ico: '🪨' },
            { nombre: 'Central Eléctrica', esc: 'central', tipo: 'electric', lider: 'Líder Trueno',   medalla: 'Medalla Rayo',     ico: '⚡' },
            { nombre: 'Pico Volcánico',    esc: 'montana', tipo: 'fire',     lider: 'Líder Brasa',    medalla: 'Medalla Llama',    ico: '🔥' },
            { nombre: 'Ruinas Místicas',   esc: 'ruinas',  tipo: 'ghost',    lider: 'Líder Espectro', medalla: 'Medalla Espíritu', ico: '👻' },
            { nombre: 'Cima del Dragón',   esc: 'montana', tipo: 'dragon',   lider: 'Líder Dragón',   medalla: 'Medalla Dragón',   ico: '🐉' }
        ];
        const nivelCampana = (dif, etapa, idx, bono = 0) =>
            Math.min(100, Math.max(3, 4 + (etapa - 1) * 7 + Math.floor(idx * 0.7) + DIFICULTADES[dif].nivel + bono + (idx >= COMBATES - 1 ? 4 : 0)));
        const progresoNuevo = () => ({ etapa: 1, combate: 0, medallas: [], elegir: false, bono: 0, ex: 0 });
        const PLACAJE = { name: 'tackle', nombre: 'Placaje', tipo: 'normal', poder: 40, precision: 100, clase: 'physical' };

        const $vista = $('#vistaAventura');
        const $inicio = $('#avInicio');
        const $hub = $('#avHub');
        const $comb = $('#avCombate');
        const $log = $('#btLog');
        const $menu = $('#btMenu');
        const $imgE = $('#btImgE');
        const $imgJ = $('#btImgJ');
        const $infoE = $('#btInfoE');
        const $infoJ = $('#btInfoJ');
        const $fx = $('#btFx');

        const espera = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 60) : ms));
        const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

        let S = cargar();
        let sel = null;
        let C = null;

        /* ---------- Guardado ---------- */
        function cargar() {
            const d = leer(KEY, null);
            if (!(d && Array.isArray(d.equipo) && d.equipo.length)) return null;
            if (!ESCENARIOS[d.escenario]) d.escenario = 'pasto';
            if (!DIFICULTADES[d.dif]) d.dif = 'facil';
            d.campana = d.campana || {};
            Object.keys(DIFICULTADES).forEach((k) => { d.campana[k] = Object.assign(progresoNuevo(), d.campana[k]); });
            d.stats = Object.assign({ victorias: 0, capturas: 0, racha: 0, mejorRacha: 0, encuentros: 0, shinys: 0, legendarios: 0 }, d.stats);
            return d;
        }
        const guardarAv = () => { if (S) guardar(KEY, S); };

        /* ---------- Fórmulas ---------- */
        const statsDe = (m) => {
            const k = m.ex ? 1.2 : 1;   // los Pokémon EX tienen +20 % en todas sus estadísticas
            const f = (b) => Math.floor((Math.floor((2 * b + IV) * m.nivel / 100) + 5) * k);
            return {
                hp: Math.floor((Math.floor((2 * m.base.hp + IV) * m.nivel / 100) + m.nivel + 10) * k),
                atk: f(m.base.atk), def: f(m.base.def), spa: f(m.base.spa), spd: f(m.base.spd), spe: f(m.base.spe)
            };
        };
        const pvMax = (m) => statsDe(m).hp;
        const xpNecesaria = (n) => Math.max(8, Math.round((Math.pow(n + 1, 3) - Math.pow(n, 3)) / 3));
        const baseDe = (p) => {
            const g = (n) => (p.stats.find((s) => s.stat.name === n) || { base_stat: 50 }).base_stat;
            return { hp: g('hp'), atk: g('attack'), def: g('defense'), spa: g('special-attack'), spd: g('special-defense'), spe: g('speed') };
        };
        const bst = (p) => p.stats.reduce((a, s) => a + s.base_stat, 0);
        const nuevoMon = (p, nivel, shiny = false) => {
            const m = {
                shiny: !!shiny,
                uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                id: p.id, nombre: p.name, tipos: p.types.map((t) => t.type.name), base: baseDe(p),
                expBase: p.base_experience || 60, nivel, xp: 0, hp: 0
            };
            m.hp = pvMax(m);
            return m;
        };
        const arte = (m) => (m.shiny ? ART_SHINY(m.id) : ART(m.id));
        const nivelPromedio = () => Math.max(2, Math.round(S.equipo.reduce((a, m) => a + m.nivel, 0) / S.equipo.length));
        const clasePv = (m) => { const r = m.hp / pvMax(m); return r > .5 ? 'alto' : r > .2 ? 'medio' : 'bajo'; };
        const nombreItem = (k) => ITEMS[k][0];

        /* ---------- Avisos ---------- */
        function aviso(texto) {
            const t = document.createElement('div');
            t.className = 'toast';
            t.textContent = texto;
            document.body.appendChild(t);
            setTimeout(() => t.classList.add('sale'), 2600);
            setTimeout(() => t.remove(), 3100);
        }

        function mostrar(cual) {
            $inicio.hidden = cual !== 'inicio';
            $hub.hidden = cual !== 'hub';
            $comb.hidden = cual !== 'comb';
        }

        function entrar() {
            if (C) { mostrar('comb'); return; }
            if (S) { renderHub(); mostrar('hub'); } else { renderInicio(); mostrar('inicio'); }
        }

        /* ---------- Pantalla inicial ---------- */
        const $starters = $('#avStarters');
        const $genTabs = $('#avGenTabs');
        let genInicio = '1';
        const shinyInicial = {};   // se sortea una vez por Pokémon y se mantiene mientras la página esté abierta

        function renderInicio() {
            $genTabs.innerHTML = Object.keys(INICIALES).map((g) =>
                `<button type="button" class="gen-tab ${g === genInicio ? 'activa' : ''}" data-gen="${g}">${g === 'especial' ? 'Especiales' : 'Gen ' + g}</button>`).join('');
            $starters.innerHTML = INICIALES[genInicio].map(([id, nombre]) => {
                if (!(id in shinyInicial)) shinyInicial[id] = Math.random() < P_SHINY_INICIAL;
                const sh = shinyInicial[id];
                return `<button class="starter ${sh ? 'shiny' : ''}" type="button" data-id="${id}" data-shiny="${sh ? 1 : 0}"><img src="${sh ? ART_SHINY(id) : ART(id)}" alt="" data-id="${id}"><b>${sh ? '✨ ' : ''}${nombre}</b><small>Nv 5${sh ? ' · ¡Shiny!' : ''}</small></button>`;
            }).join('');
        }

        $genTabs.addEventListener('click', (e) => {
            const b = e.target.closest('[data-gen]');
            if (!b) return;
            genInicio = b.dataset.gen;
            renderInicio();
        });

        $starters.addEventListener('click', async (e) => {
            const b = e.target.closest('.starter');
            if (!b) return;
            if (S && !confirm('Ya tenés una partida guardada. ¿Empezar una nueva y borrar la anterior?')) return;
            b.disabled = true;
            try {
                const p = await api('/pokemon/' + b.dataset.id);
                S = {
                    equipo: [nuevoMon(p, 5, b.dataset.shiny === '1')], caja: [], registro: [p.id],
                    items: { pokeball: 8, superball: 0, pocion: 3, superpocion: 0 },
                    stats: { victorias: 0, capturas: 0, racha: 0, mejorRacha: 0, encuentros: 0, shinys: b.dataset.shiny === '1' ? 1 : 0, legendarios: 0 },
                    zona: 'todas', escenario: 'pasto', dif: 'facil', campana: { facil: progresoNuevo(), medio: progresoNuevo(), dificil: progresoNuevo() }, equipoCompleto: false
                };
                guardarAv();
                sel = null;
                renderHub();
                mostrar('hub');
            } catch (err) {
                aviso('No se pudo conectar con PokéAPI. Probá de nuevo.');
            }
            b.disabled = false;
        });

        /* ---------- Hub: equipo, caja y exploración ---------- */
        function cardMon(m, lugar, i) {
            const activa = sel && sel.lugar === lugar && sel.idx === i;
            const max = pvMax(m);
            return `<button class="mon ${activa ? 'sel' : ''} ${m.hp <= 0 ? 'ko' : ''} ${m.ex ? 'ex' : ''}" type="button" data-lugar="${lugar}" data-idx="${i}">
                <img src="${arte(m)}" alt="" loading="lazy" data-id="${m.id}">
                <b>${m.shiny ? '<span class="shiny-ico" title="Shiny">✨</span> ' : ''}${esc(bonito(m.nombre))}${m.ex ? ' <em class="ex-tag">EX</em>' : ''}</b>
                <small>Nv ${m.nivel}</small>
                <span class="hpbar ${clasePv(m)}"><i style="width:${Math.max(0, Math.round(m.hp / max * 100))}%"></i></span>
                <small class="hptxt">${m.hp}/${max}</small>
            </button>`;
        }

        function renderHub() {
            const eq = S.equipo.map((m, i) => cardMon(m, 'equipo', i)).join('');
            const vacios = Array.from({ length: MAX_EQUIPO - S.equipo.length }, () => '<div class="mon vacio"><span>Libre</span></div>').join('');
            const caja = S.caja.length
                ? S.caja.map((m, i) => cardMon(m, 'caja', i)).join('')
                : '<p class="vacio">La caja está vacía. Cuando tu equipo esté completo, los Pokémon capturados vendrán acá.</p>';
            const items = Object.keys(ITEMS).map((k) => `<div class="item-av"><b>${S.items[k]}</b><small>${esc(nombreItem(k))}</small></div>`).join('');
            const zonas = ['<option value="todas">Todas las regiones</option>']
                .concat(Object.keys(GENS).map((g) => `<option value="${g}" ${String(S.zona) === g ? 'selected' : ''}>Gen ${g}</option>`)).join('');
            const esc2 = Object.keys(ESCENARIOS).map((k) => `<option value="${k}" ${S.escenario === k ? 'selected' : ''}>${ESCENARIOS[k].icono} ${ESCENARIOS[k].nombre}</option>`).join('');
            const vivos = S.equipo.some((m) => m.hp > 0);
            const prog = S.campana[S.dif];
            const puedeCurar = S.dif === 'facil' || prog.combate === 0;

            $hub.innerHTML = `
            <div class="av-barra">
                <div><small>Capturados</small><b>${S.registro.length}<em>/${TOTAL}</em></b></div>
                <div><small>Victorias</small><b>${S.stats.victorias}</b></div>
                <div><small>Racha</small><b>${S.stats.racha}</b></div>
                <div><small>Mejor racha</small><b>${S.stats.mejorRacha}</b></div>
                <div><small>✨ Shinys</small><b>${S.stats.shinys}</b></div>
                <div><small>👑 Legendarios</small><b>${S.stats.legendarios}</b></div>
            </div>
            <div class="av-items">${items}</div>
            ${panelCampana(vivos)}
            <div class="av-libre"><h3>🌿 Exploración libre</h3><p class="av-ayuda">Combatí sin reglas: elegí región y escenario, capturá y entrená a tu equipo.</p></div>
            <div class="av-acciones">
                <label class="av-zona">Región <select id="avZona">${zonas}</select></label>
                <label class="av-zona">Escenario <select id="avEsc">${esc2}</select></label>
                <button class="btn-grande" id="avExplorar" type="button" ${vivos ? '' : 'disabled'}>${ESCENARIOS[S.escenario].icono} Explorar</button>
                <button class="btn-sec" id="avCurar" type="button" ${puedeCurar ? '' : 'disabled title="En esta dificultad solo podés curar al empezar una etapa"'}>➕ Curar equipo</button>
            </div>
            ${vivos ? '' : '<p class="av-aviso">Todo tu equipo está debilitado. Curalo para seguir explorando.</p>'}
            <div class="av-seccion">
                <h3>Tu equipo <span>${S.equipo.length}/${MAX_EQUIPO}</span></h3>
                <div class="av-equipo">${eq}${vacios}</div>
            </div>
            <div id="avSel"></div>
            <div class="av-seccion">
                <h3>Caja <span>${S.caja.length}</span></h3>
                <div class="av-caja">${caja}</div>
            </div>
            <div class="av-pie"><button class="btn-sec" id="avReiniciar" type="button">Empezar de cero</button></div>`;
            renderSeleccion();
        }

        /* ---------- Campaña ---------- */
        let resultadoCamino = '';

        function panelCampana(vivos) {
            const dif = S.dif, prog = S.campana[dif];
            const tabs = Object.keys(DIFICULTADES).map((k) =>
                `<button type="button" class="dif-tab ${k === dif ? 'activa' : ''}" data-dif="${k}">${DIFICULTADES[k].icono} ${DIFICULTADES[k].nombre} <small>${S.campana[k].medallas.length}/${ETAPAS.length}</small></button>`).join('');
            const etapas = ETAPAS.map((e, i) => {
                const hecha = prog.medallas.includes(i), actual = i + 1 === prog.etapa;
                return `<div class="etapa ${hecha ? 'hecha' : actual ? 'actual' : 'bloq'}" title="${esc(e.nombre)}"><span>${hecha ? e.ico : actual ? '⚔️' : '🔒'}</span><small>${i + 1}</small></div>`;
            }).join('');
            let cuerpo = '';
            let exHtml = '';
            if (prog.ex > 0) {
                const cand = []
                    .concat(S.equipo.map((m, i) => ({ m, l: 'equipo', i })), S.caja.map((m, i) => ({ m, l: 'caja', i })))
                    .filter((x) => !x.m.ex);
                exHtml = `<div class="ex-panel"><h4>⭐ Evolución EX disponible (${prog.ex})</h4>
                    <p class="av-ayuda">Elegí un Pokémon: evoluciona a su forma final y se vuelve EX (+20 % en todas sus estadísticas).</p>
                    <div class="ex-lista">${cand.length ? cand.map((x) => `<button type="button" class="ex-op" data-ex="${x.l}:${x.i}"><img src="${arte(x.m)}" alt="" data-id="${x.m.id}"><b>${esc(bonito(x.m.nombre))}</b><small>Nv ${x.m.nivel}</small></button>`).join('') : '<p class="vacio">Todos tus Pokémon ya son EX.</p>'}</div></div>`;
            }
            if (prog.etapa > ETAPAS.length) {
                cuerpo = `<div class="camp-fin">🏆 <b>¡Completaste la campaña en modo ${DIFICULTADES[dif].nombre}!</b><br><small>Conseguiste las ${ETAPAS.length} medallas. Probá otra dificultad.</small>
                    <button class="btn-sec" type="button" id="avRepetir">Volver a empezar esta dificultad</button></div>`;
            } else if (prog.elegir) {
                cuerpo = `<div class="camino"><h4>🛤️ Elegí tu camino</h4>
                    <div class="camino-opc">
                        <button type="button" class="camino-btn" data-camino="seguro"><b>🎁 Camino seguro</b><small>Recompensa completa de objetos.</small></button>
                        <button type="button" class="camino-btn riesgo" data-camino="riesgo"><b>🎲 Camino arriesgado</b><small>Recompensa + un Pokémon aleatorio (¡puede ser shiny ✨!). El próximo rival será más fuerte.</small></button>
                    </div></div>`;
            } else {
                const e = ETAPAS[prog.etapa - 1];
                const lider = prog.combate >= COMBATES - 1;
                const pct = Math.round(prog.combate / COMBATES * 100);
                cuerpo = `<div class="camp-actual">
                    <div class="camp-info"><b>Etapa ${prog.etapa}: ${esc(e.nombre)}</b>
                    <small>${lider ? `🏅 Combate final contra el ${esc(e.lider)} · premio: ${esc(e.medalla)}` : `Combate ${prog.combate + 1} de ${COMBATES}${prog.bono ? ' · ⚠️ rival reforzado' : ''}`}</small>
                    <div class="xpbar camp-barra"><i style="width:${pct}%"></i></div></div>
                    <button class="btn-grande" id="avCampana" type="button" ${vivos ? '' : 'disabled'}>${lider ? '🏅 Desafiar al líder' : '⚔️ Siguiente combate'}</button></div>`;
            }
            const medallas = prog.medallas.length
                ? `<div class="medallero">${prog.medallas.map((i) => `<span title="${esc(ETAPAS[i].medalla)}">${ETAPAS[i].ico}</span>`).join('')}</div>` : '';
            return `<div class="av-seccion campana">
                <h3>🧭 Campaña</h3>
                <div class="dif-tabs">${tabs}</div>
                <p class="av-ayuda">${esc(DIFICULTADES[dif].desc)}</p>
                <div class="etapas">${etapas}</div>
                ${medallas}
                ${resultadoCamino}
                ${exHtml}
                ${cuerpo}
            </div>`;
        }

        // Hace evolucionar a un Pokémon "hacia adelante" mientras su nivel lo permita (para rivales y premios)
        async function segunNivel(p, nivel) {
            for (let k = 0; k < 2; k++) {
                try {
                    const sp = await api('/pokemon-species/' + p.id);
                    if (!sp.evolution_chain) break;
                    const cadena = await api(sp.evolution_chain.url);
                    const nodo = buscarNodo(cadena.chain, p.id);
                    if (!nodo) break;
                    const posibles = nodo.evolves_to.filter((h) => nivelEvolucion(h) <= nivel && idDeUrl(h.species.url) <= TOTAL);
                    if (!posibles.length) break;
                    p = await api('/pokemon/' + idDeUrl(posibles[rnd(0, posibles.length - 1)].species.url));
                } catch (e) { break; }
            }
            return p;
        }

        async function pokemonCampana(camp) {
            const e = ETAPAS[camp.etapa - 1];
            let id;
            if (camp.lider) {
                const t = await api('/type/' + e.tipo);
                const ids = t.pokemon.map((x) => idDeUrl(x.pokemon.url)).filter((x) => x && x <= TOTAL);
                id = ids[rnd(0, ids.length - 1)];
            } else {
                const r = await pokemonSalvaje(false, ESCENARIOS[e.esc], 310 + camp.nivel * 9);
                id = r.p.id;
            }
            let p = await api('/pokemon/' + id);
            p = await segunNivel(p, camp.nivel);
            const sp = await api('/pokemon-species/' + p.id);
            return { p, sp };
        }

        // Pokémon aleatorio de premio (puede ser shiny); evoluciona según el nivel
        async function pokemonPremio(dif, etapa, extraShiny = 1) {
            const nivel = Math.max(3, Math.round(nivelPromedio() * 0.9));
            let p = null;
            for (let i = 0; i < 8 && !p; i++) {
                const legendario = etapa >= 6 && Math.random() < 1 / 25;
                const id = legendario ? LEGENDARIOS[rnd(0, LEGENDARIOS.length - 1)] : rnd(1, TOTAL);
                try {
                    const [q, sp] = await Promise.all([api('/pokemon/' + id), api('/pokemon-species/' + id)]);
                    if (!legendario && (sp.is_legendary || sp.is_mythical)) continue;
                    if (!legendario && bst(q) > 250 + nivel * 9 + 60) continue;
                    p = q;
                } catch (e) { /* reintenta */ }
            }
            if (!p) p = await api('/pokemon/' + rnd(1, 151));
            p = await segunNivel(p, nivel);
            const shiny = Math.random() < Math.min(.5, DIFICULTADES[dif].shiny * extraShiny);
            return nuevoMon(p, nivel, shiny);
        }

        function recibirPokemon(m) {
            const alEquipo = S.equipo.length < MAX_EQUIPO;
            (alEquipo ? S.equipo : S.caja).push(m);
            if (!S.registro.includes(m.id)) S.registro.push(m.id);
            S.stats.capturas++;
            if (m.shiny) S.stats.shinys++;
            if (LEGENDARIOS.includes(m.id)) S.stats.legendarios++;
            if (S.equipo.length === MAX_EQUIPO && !S.equipoCompleto) S.equipoCompleto = true;
            return alEquipo ? 'a tu equipo' : 'a la Caja';
        }

        function darObjetos(dif, etapa, grande) {
            const k = DIFICULTADES[dif].premio * (grande ? 1.6 : 1);
            const ganado = [];
            const sumar = (it, n) => { n = Math.max(0, Math.round(n)); if (!n) return; S.items[it] += n; ganado.push(`${n} ${nombreItem(it)}`); };
            sumar('pokeball', rnd(3, 5) * k);
            sumar('pocion', rnd(1, 2) * k);
            if (etapa >= 2) sumar('superball', rnd(1, 2) * k);
            if (etapa >= 3) sumar('superpocion', rnd(1, 2) * k * .8);
            return ganado;
        }

        async function elegirCamino(tipo) {
            const dif = S.dif, prog = S.campana[dif];
            if (!prog.elegir) return;
            let html = '';
            const ganado = darObjetos(dif, prog.etapa, false);
            html += `<div class="resultado"><b>🎁 Recompensa:</b> ${ganado.join(', ')}.`;
            prog.bono = 0;
            if (tipo === 'riesgo') {
                try {
                    const m = await pokemonPremio(dif, prog.etapa);
                    const donde = recibirPokemon(m);
                    html += `<div class="premio-mon ${m.shiny ? 'shiny' : ''}"><img src="${arte(m)}" alt="" data-id="${m.id}"><span>${m.shiny ? '✨ ¡SHINY! ' : ''}<b>${esc(bonito(m.nombre))}</b> Nv ${m.nivel} se unió ${donde}.</span></div>`;
                    prog.bono = 3;
                } catch (e) { html += ' (No se pudo obtener el Pokémon: sin conexión).'; }
            }
            html += '</div>';
            prog.elegir = false;
            resultadoCamino = html;
            guardarAv();
            renderHub();
        }

        async function finCampana(capturado) {
            const dif = S.dif, prog = S.campana[dif];
            const e = ETAPAS[prog.etapa - 1];
            const lider = C.lider;
            C = null;
            if (lider) {
                prog.medallas.push(prog.etapa - 1);
                const ganado = darObjetos(dif, prog.etapa, true);
                let html = `<div class="resultado medalla"><b>${e.ico} ¡Ganaste la ${esc(e.medalla)}!</b><br>🎁 ${ganado.join(', ')}.`;
                try {
                    const m = await pokemonPremio(dif, prog.etapa, 2);
                    const donde = recibirPokemon(m);
                    html += `<div class="premio-mon ${m.shiny ? 'shiny' : ''}"><img src="${arte(m)}" alt="" data-id="${m.id}"><span>${m.shiny ? '✨ ¡SHINY! ' : ''}<b>${esc(bonito(m.nombre))}</b> Nv ${m.nivel} se unió ${donde}.</span></div>`;
                } catch (err) { /* sin Pokémon extra */ }
                html += '<br>⭐ <b>Premio especial: una Evolución EX</b> para el Pokémon que elijas.</div>';
                resultadoCamino = html;
                prog.ex = (prog.ex || 0) + 1;
                prog.etapa++; prog.combate = 0; prog.bono = 0; prog.elegir = false;
                S.equipo.forEach((m) => { m.hp = pvMax(m); });
            } else {
                prog.combate++;
                prog.elegir = true;
                resultadoCamino = '';
            }
            terminar();
        }

        /* ---------- Evolución EX (premio de los líderes) ---------- */
        async function aplicarEX(lugar, idx) {
            const m = (lugar === 'equipo' ? S.equipo : S.caja)[idx];
            const prog = S.campana[S.dif];
            if (!m || !prog.ex) return;
            const viejo = bonito(m.nombre);
            let p = null;
            try { p = await segunNivel(await api('/pokemon/' + m.id), 100); } catch (e) { /* queda en su forma */ }
            if (p && p.id !== m.id) {
                m.id = p.id; m.nombre = p.name; m.tipos = p.types.map((t) => t.type.name); m.base = baseDe(p); m.expBase = p.base_experience || m.expBase;
                if (!S.registro.includes(m.id)) S.registro.push(m.id);
            }
            m.ex = true;
            m.hp = pvMax(m);
            prog.ex--;
            resultadoCamino = `<div class="resultado medalla"><b>⭐ ¡Evolución EX!</b><div class="premio-mon ex"><img src="${arte(m)}" alt="" data-id="${m.id}"><span><b>${esc(viejo)}</b> ${p && bonito(m.nombre) !== viejo ? `evolucionó a <b>${esc(bonito(m.nombre))}</b> y ` : ''}ahora es <b>EX</b>: +20 % en todas sus estadísticas.</span></div></div>`;
            guardarAv();
            renderHub();
        }

        function renderSeleccion() {
            const cont = $('#avSel', $hub);
            if (!cont) return;
            if (!sel) { cont.innerHTML = '<p class="av-ayuda">Tocá un Pokémon para ver sus opciones. Tocá otro para intercambiarlos de lugar.</p>'; return; }
            const m = (sel.lugar === 'equipo' ? S.equipo : S.caja)[sel.idx];
            if (!m) { sel = null; renderSeleccion(); return; }
            const botones = [`<button type="button" data-acc="ficha">Ver ficha</button>`];
            if (sel.lugar === 'equipo' && S.equipo.length > 1) botones.push('<button type="button" data-acc="acaja">Mover a la caja</button>');
            if (sel.lugar === 'caja' && S.equipo.length < MAX_EQUIPO) botones.push('<button type="button" data-acc="alequipo">Pasar al equipo</button>');
            if (sel.lugar === 'equipo' && sel.idx > 0) botones.push('<button type="button" data-acc="primero">Poner primero</button>');
            if (S.equipo.length + S.caja.length > 1) botones.push('<button type="button" data-acc="liberar" class="peligro">Liberar</button>');
            botones.push('<button type="button" data-acc="cancelar">Cancelar</button>');
            cont.innerHTML = `<div class="av-selbar"><span><b>${esc(bonito(m.nombre))}</b> · Nv ${m.nivel}</span><div>${botones.join('')}</div></div>`;
        }

        $hub.addEventListener('change', (e) => {
            if (e.target.id === 'avZona') { S.zona = e.target.value; guardarAv(); }
            if (e.target.id === 'avEsc') { S.escenario = e.target.value; guardarAv(); const b = $('#avExplorar', $hub); if (b) b.textContent = ESCENARIOS[S.escenario].icono + ' Explorar'; }
        });

        $hub.addEventListener('click', (e) => {
            const mon = e.target.closest('.mon:not(.vacio)');
            if (mon) {
                const lugar = mon.dataset.lugar;
                const idx = Number(mon.dataset.idx);
                if (!sel) sel = { lugar, idx };
                else if (sel.lugar === lugar && sel.idx === idx) sel = null;
                else {
                    const a = sel.lugar === 'equipo' ? S.equipo : S.caja;
                    const b = lugar === 'equipo' ? S.equipo : S.caja;
                    [a[sel.idx], b[idx]] = [b[idx], a[sel.idx]];
                    sel = null;
                    guardarAv();
                }
                renderHub();
                return;
            }
            const acc = e.target.closest('[data-acc]');
            if (acc && sel) {
                const lista = sel.lugar === 'equipo' ? S.equipo : S.caja;
                const m = lista[sel.idx];
                const a = acc.dataset.acc;
                if (a === 'ficha') { abrir(m.id); return; }
                if (a === 'acaja') { S.caja.push(S.equipo.splice(sel.idx, 1)[0]); }
                else if (a === 'alequipo') { S.equipo.push(S.caja.splice(sel.idx, 1)[0]); }
                else if (a === 'primero') { S.equipo.unshift(S.equipo.splice(sel.idx, 1)[0]); }
                else if (a === 'liberar') {
                    if (!confirm(`¿Liberar a ${bonito(m.nombre)}? No se puede deshacer.`)) return;
                    if (sel.lugar === 'equipo' && S.equipo.length === 1) { aviso('Tu último Pokémon del equipo no se puede liberar.'); return; }
                    lista.splice(sel.idx, 1);
                }
                sel = null;
                guardarAv();
                renderHub();
                return;
            }
            const exb = e.target.closest('[data-ex]');
            if (exb) { const [l, i] = exb.dataset.ex.split(':'); exb.disabled = true; aplicarEX(l, Number(i)); return; }
            const dt = e.target.closest('[data-dif]');
            if (dt) { S.dif = dt.dataset.dif; resultadoCamino = ''; guardarAv(); renderHub(); return; }
            const cam = e.target.closest('[data-camino]');
            if (cam) { cam.disabled = true; elegirCamino(cam.dataset.camino); return; }
            if (e.target.closest('#avCampana')) {
                const prog = S.campana[S.dif];
                const bono = prog.bono || 0;
                resultadoCamino = '';
                explorar({ campana: true, etapa: prog.etapa, idx: prog.combate, lider: prog.combate >= COMBATES - 1, nivel: nivelCampana(S.dif, prog.etapa, prog.combate, bono), escenario: ETAPAS[prog.etapa - 1].esc });
                return;
            }
            if (e.target.closest('#avRepetir')) {
                if (!confirm('Se reinicia el progreso de esta dificultad (tus Pokémon se conservan). ¿Seguro?')) return;
                S.campana[S.dif] = progresoNuevo(); resultadoCamino = ''; guardarAv(); renderHub(); return;
            }
            if (e.target.closest('#avExplorar')) { explorar(); return; }
            if (e.target.closest('#avCurar')) {
                S.equipo.forEach((m) => { m.hp = pvMax(m); });
                guardarAv();
                aviso('Tu equipo fue curado por completo.');
                renderHub();
                return;
            }
            if (e.target.closest('#avReiniciar')) {
                if (!confirm('Esto borra tu equipo, caja y progreso. ¿Seguro?')) return;
                S = null; sel = null; C = null;
                try { localStorage.removeItem(KEY); } catch (err) { /* sin storage */ }
                renderInicio();
                mostrar('inicio');
            }
        });

        /* ---------- Datos para el combate ---------- */
        async function efectividad(tipoMov, tiposDef) {
            const d = await api('/type/' + tipoMov);
            const r = d.damage_relations;
            let m = 1;
            tiposDef.forEach((t) => {
                if (r.double_damage_to.some((x) => x.name === t)) m *= 2;
                else if (r.half_damage_to.some((x) => x.name === t)) m *= 0.5;
                else if (r.no_damage_to.some((x) => x.name === t)) m *= 0;
            });
            return m;
        }

        const aMov = (name, d, extra) => Object.assign({
            name, nombre: textoEs(d.names, 'name') || bonito(name), tipo: d.type.name,
            poder: d.power, precision: d.accuracy, clase: d.damage_class.name
        }, extra || {});
        const esDano = (d) => d && d.power && d.damage_class && d.damage_class.name !== 'status';
        const detalleMov = (name) => api('/move/' + name).then((d) => ({ name, d })).catch(() => null);

        // Hasta 4 ataques, siempre del repertorio del propio Pokémon:
        //  1) los que aprende por nivel hasta su nivel actual (los más recientes);
        //  2) si faltan, otros de su lista (MT, tutor, huevo) de poder acorde a su nivel;
        //  3) si aún faltan y es un Pokémon del jugador, quedan "bloqueados" y se aprenden al llegar a su nivel.
        async function movsBatalla(p, nivel, conBloqueados = false) {
            const porNivel = movimientosPorNivel(p).filter((m) => !PROHIBIDOS.has(m.name));
            const ya = porNivel.filter((m) => m.nivel <= nivel).reverse();
            const proximos = porNivel.filter((m) => m.nivel > nivel);
            const out = [];
            const usados = new Set();
            const agregar = (x, extra) => {
                if (!x || !esDano(x.d) || usados.has(x.name) || out.length >= 4) return;
                usados.add(x.name);
                out.push(aMov(x.name, x.d, extra));
            };
            (await Promise.all(ya.slice(0, 16).map((m) => detalleMov(m.name)))).forEach((x) => agregar(x));

            if (out.length < 4) {
                const propios = new Set(porNivel.map((m) => m.name));
                const extras = p.moves.map((m) => m.move.name).filter((n) => !propios.has(n) && !PROHIBIDOS.has(n)).slice(0, 40);
                const tope = 45 + nivel * 1.2;
                const det = (await Promise.all(extras.slice(0, 18).map(detalleMov)))
                    .filter((x) => x && esDano(x.d) && x.d.power <= tope && x.d.accuracy)
                    .sort((a, b) => b.d.power - a.d.power);
                det.forEach((x) => agregar(x));
            }

            if (conBloqueados && out.length < 4) {
                const det = await Promise.all(proximos.slice(0, 10).map((m) => detalleMov(m.name).then((x) => x && Object.assign(x, { req: m.nivel }))));
                for (const x of det) {
                    if (out.length >= 4) break;
                    if (!x || !esDano(x.d) || usados.has(x.name)) continue;
                    usados.add(x.name);
                    out.push(aMov(x.name, x.d, { bloqueado: true, req: x.req }));
                }
            }
            if (!out.some((m) => !m.bloqueado)) out.unshift(PLACAJE);
            return out;
        }

        async function pokemonSalvaje(alfa, escForzado, limiteBst) {
            const camp = !!escForzado;
            const [a, b] = camp || S.zona === 'todas' ? [1, TOTAL] : GENS[S.zona];
            const esc = escForzado || ESCENARIOS[S.escenario] || ESCENARIOS.pasto;
            const prom = nivelPromedio();
            // ¿Legendario? Puede aparecer en cualquier escenario (más probable en los más exigentes)
            if (!camp && Math.random() < P_LEGENDARIO * esc.legend) {
                const pool = LEGENDARIOS.filter((id) => id >= a && id <= b);
                if (pool.length) {
                    try {
                        const id = pool[rnd(0, pool.length - 1)];
                        const [p, sp] = await Promise.all([api('/pokemon/' + id), api('/pokemon-species/' + id)]);
                        return { p, sp, legendario: true };
                    } catch (e) { /* si falla, se sigue con uno normal */ }
                }
            }
            const limite = limiteBst || (300 + prom * 8 + (alfa ? 70 : 0) + esc.nivel * 6);
            let ultimo = null;
            for (let i = 0; i < 10; i++) {
                const id = rnd(a, b);
                const [p, sp] = await Promise.all([api('/pokemon/' + id), api('/pokemon-species/' + id)]);
                if (sp.is_legendary || sp.is_mythical) continue;
                if (!ultimo || bst(p) < bst(ultimo.p)) ultimo = { p, sp };   // plan B: el más débil visto
                if (bst(p) > limite) continue;
                // Los primeros intentos exigen un tipo propio del escenario; después se acepta cualquiera
                if (i < 7 && !p.types.some((t) => esc.tipos.includes(t.type.name))) continue;
                return { p, sp };
            }
            return ultimo;
        }

        /* ---------- Combate: pantalla ---------- */
        const J = () => S.equipo[C.idx];
        const E = () => C.enemigo.mon;
        const nombreE = () => bonito(E().nombre);
        const nombreJ = () => bonito(J().nombre);

        function infoHTML(m, lado) {
            const max = pvMax(m);
            const pct = Math.max(0, Math.round(m.hp / max * 100));
            const xp = lado === 'j' ? `<div class="xpbar"><i style="width:${m.nivel >= 100 ? 100 : Math.min(100, Math.round(m.xp / xpNecesaria(m.nivel) * 100))}%"></i></div>` : '';
            const num = lado === 'j' ? `<small class="hptxt">${Math.max(0, m.hp)}/${max}</small>` : '';
            const alfa = lado === 'e' && C.alfa ? (C.lider ? '<em class="alfa">LÍDER</em>' : '<em class="alfa">ALFA</em>') : '';
            const leg = lado === 'e' && C.legendario ? '<em class="legend">LEGENDARIO</em>' : '';
            const shiny = m.shiny ? '<em class="shiny">✨</em>' : '';
            const ex = m.ex ? '<em class="ex-tag">EX</em>' : '';
            return `<div class="bt-nombre"><b>${esc(bonito(m.nombre))}</b>${shiny}${ex}${leg}${alfa}<span>Nv ${m.nivel}</span></div>
                <div class="bt-tipos">${m.tipos.map(insignia).join('')}</div>
                <div class="hpbar ${clasePv(m)}"><i style="width:${pct}%"></i></div>${num}${xp}`;
        }

        function pintarCampo() {
            $infoE.innerHTML = infoHTML(E(), 'e');
            $infoJ.innerHTML = infoHTML(J(), 'j');
        }
        function pintarSprites() {
            $imgE.classList.toggle('ex', !!E().ex); $imgJ.classList.toggle('ex', !!J().ex); $imgE.src = arte(E()); $imgE.dataset.id = E().id; $imgE.alt = bonito(E().nombre);
            $imgJ.src = arte(J()); $imgJ.dataset.id = J().id; $imgJ.alt = bonito(J().nombre);
        }

        async function anim(el, clase, ms) {
            el.classList.remove(clase);
            void el.offsetWidth;
            el.classList.add(clase);
            await espera(ms);
            if (clase !== 'cae') el.classList.remove(clase);
        }

        async function mensaje(texto, ms = 1000) {
            $log.textContent = texto;
            await espera(ms);
        }

        function limpiarMenu() { $menu.innerHTML = ''; }

        /* ---------- Combate: inicio ---------- */
        async function explorar(camp) {
            if (!S.equipo.some((m) => m.hp > 0)) { aviso('Primero curá a tu equipo.'); return; }
            mostrar('comb');
            limpiarMenu();
            $log.textContent = camp ? (camp.lider ? 'El líder te espera…' : 'Avanzás por ' + ETAPAS[camp.etapa - 1].nombre + '…') : 'Explorando: ' + (ESCENARIOS[S.escenario] || ESCENARIOS.pasto).nombre + '…';
            $('#btCampo').dataset.esc = camp ? camp.escenario : S.escenario;
            $imgE.className = ''; $imgJ.className = '';
            $imgE.style.visibility = 'hidden'; $imgJ.style.visibility = 'hidden';
            $infoE.innerHTML = ''; $infoJ.innerHTML = ''; $fx.innerHTML = '';
            if (!camp) S.stats.encuentros++;
            const alfa = camp ? !!camp.lider : S.stats.encuentros % 5 === 0;
            let w;
            try { w = camp ? await pokemonCampana(camp) : await pokemonSalvaje(alfa); } catch (e) { w = null; }
            if (!w) {
                if (!camp) S.stats.encuentros--;
                aviso('No se pudo conectar con PokéAPI. Probá de nuevo.');
                renderHub(); mostrar('hub');
                return;
            }
            const esc = ESCENARIOS[S.escenario] || ESCENARIOS.pasto;
            const legendario = !!w.legendario;
            let nivel = Math.min(100, Math.max(2, nivelPromedio() + rnd(-2, 2) + (alfa ? 3 : 0) + esc.nivel));
            if (legendario) nivel = Math.min(100, Math.max(15, nivelPromedio() + rnd(2, 6)));
            if (camp) nivel = camp.nivel;
            const shiny = Math.random() < (camp ? (camp.lider ? P_SHINY_ALFA : P_SHINY) : (alfa || legendario ? P_SHINY_ALFA : P_SHINY));
            const mon = nuevoMon(w.p, nivel, shiny);
            C = {
                enemigo: { mon, data: w.p, movs: null, rate: w.sp.capture_rate || 45 },
                alfa, legendario, campana: !!camp, lider: camp && camp.lider ? ETAPAS[camp.etapa - 1] : null, idx: S.equipo.findIndex((m) => m.hp > 0), participantes: new Set(), movsJ: null, ocupado: true
            };
            C.participantes.add(J().uid);
            try {
                const [mE, mJ] = await Promise.all([movsBatalla(w.p, nivel), cargarMovsJ()]);
                C.enemigo.movs = mE; C.movsJ = mJ;
            } catch (e) {
                C = null; if (!camp) S.stats.encuentros--;
                aviso('No se pudieron cargar los movimientos. Probá de nuevo.');
                renderHub(); mostrar('hub');
                return;
            }
            pintarSprites();
            pintarCampo();
            $imgE.style.visibility = ''; $imgJ.style.visibility = '';
            anim($imgE, 'entra-e', 700);
            if (shiny) destello();
            const txt = C.lider ? `¡${C.lider.lider} te desafía con ${nombreE()}!` : legendario ? `¡Un ${nombreE()} LEGENDARIO apareció! Su presencia es abrumadora…`
                : alfa ? `¡Un ${nombreE()} ALFA apareció! Es mucho más fuerte.` : `¡Un ${nombreE()} salvaje apareció!`;
            await mensaje((shiny ? '✨ ¡Es un Pokémon SHINY! ✨ ' : '') + txt, shiny || legendario ? 2000 : 1300);
            await anim($imgJ, 'entra-j', 650);
            await mensaje(`¡Adelante, ${nombreJ()}!`, 800);
            menuPrincipal();
        }

        // Lluvia de destellos cuando aparece un shiny
        function destello() {
            if (reduceMotion) return;
            for (let i = 0; i < 14; i++) {
                const d = document.createElement('i');
                d.className = 'fx fx-estrella';
                d.style.cssText = `left:${rnd(58, 94)}%;top:${rnd(6, 52)}%;--c:#fde68a;--t:${rnd(3, 6)}%`;
                $fx.appendChild(d);
                d.animate([{ transform: 'translate(-50%,-50%) scale(0) rotate(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.2) rotate(120deg)', opacity: 1, offset: .4 }, { transform: 'translate(-50%,-50%) scale(0) rotate(240deg)', opacity: 0 }],
                    { duration: 1100, delay: i * 70, fill: 'both' }).finished.then(() => d.remove()).catch(() => d.remove());
            }
        }

        async function cargarMovsJ() {
            const m = J();
            const p = await api('/pokemon/' + m.id);
            return movsBatalla(p, m.nivel, true);
        }

        /* ---------- Combate: menús ---------- */
        function botones(lista) {
            $menu.innerHTML = lista.map((b, i) =>
                `<button type="button" class="${b.clase || ''}" data-i="${i}" ${b.off ? 'disabled' : ''}>${b.html}</button>`
            ).join('');
            $menu.onclick = (e) => {
                const el = e.target.closest('button[data-i]');
                if (!el || el.disabled) return;
                lista[Number(el.dataset.i)].fn();
            };
        }

        function menuPrincipal() {
            C.ocupado = false;
            $log.textContent = `¿Qué hará ${nombreJ()}?`;
            const l = [{ html: '⚔️ Luchar', fn: menuMovs, clase: 'p' }];
            if (!C.lider) l.push({ html: '⚪ Pokébola', fn: menuBolas });
            l.push({ html: '🧪 Poción', fn: menuPociones }, { html: '🔄 Pokémon', fn: () => menuCambio(false) });
            if (!C.lider) l.push({ html: '🏃 Huir', fn: () => turno({ t: 'huir' }) });
            botones(l);
        }

        function menuMovs() {
            const l = C.movsJ.map((m) => m.bloqueado ? ({
                html: `<span class="mv-nombre">🔒 ${esc(m.nombre)}</span>${insignia(m.tipo)}<small>Lo aprende en el Nv ${m.req}</small>`,
                fn: () => {}, clase: 'mov-btn bloq', off: true
            }) : ({
                html: `<span class="mv-nombre">${esc(m.nombre)}</span>${insignia(m.tipo)}<small>Poder ${m.poder} · ${m.precision ? m.precision + '%' : '—'}</small>`,
                fn: () => turno({ t: 'mov', mov: m }), clase: 'mov-btn'
            }));
            l.push({ html: '↩ Volver', fn: menuPrincipal, clase: 'volver' });
            botones(l);
        }

        function menuBolas() {
            botones([
                { html: `Poké Ball <small>×${S.items.pokeball}</small>`, off: S.items.pokeball < 1, fn: () => turno({ t: 'bola', tipo: 'pokeball' }) },
                { html: `Super Ball <small>×${S.items.superball}</small>`, off: S.items.superball < 1, fn: () => turno({ t: 'bola', tipo: 'superball' }) },
                { html: '↩ Volver', fn: menuPrincipal, clase: 'volver' }
            ]);
        }

        function menuPociones() {
            const lleno = J().hp >= pvMax(J());
            botones([
                { html: `Poción <small>×${S.items.pocion} · +20 PS</small>`, off: S.items.pocion < 1 || lleno, fn: () => turno({ t: 'pocion', tipo: 'pocion' }) },
                { html: `Super Poción <small>×${S.items.superpocion} · +60 PS</small>`, off: S.items.superpocion < 1 || lleno, fn: () => turno({ t: 'pocion', tipo: 'superpocion' }) },
                { html: '↩ Volver', fn: menuPrincipal, clase: 'volver' }
            ]);
        }

        function menuCambio(forzado) {
            $log.textContent = forzado ? 'Elegí el siguiente Pokémon.' : '¿A quién querés sacar?';
            const l = S.equipo.map((m, i) => ({
                html: `<img src="${arte(m)}" alt="" data-id="${m.id}"><span>${m.shiny ? '✨ ' : ''}${esc(bonito(m.nombre))} <small>Nv ${m.nivel} · ${Math.max(0, m.hp)}/${pvMax(m)}</small></span>`,
                off: m.hp <= 0 || i === C.idx, clase: 'cambio-btn',
                fn: () => (forzado ? cambiarForzado(i) : turno({ t: 'cambio', idx: i }))
            }));
            if (!forzado) l.push({ html: '↩ Volver', fn: menuPrincipal, clase: 'volver' });
            botones(l);
        }

        /* ---------- Combate: turnos ---------- */
        async function elegirMovEnemigo() {
            const movs = C.enemigo.movs;
            if (Math.random() < .3) return movs[rnd(0, movs.length - 1)];
            let mejor = movs[0], valor = -1;
            for (const m of movs) {
                const ef = await efectividad(m.tipo, J().tipos);
                const v = m.poder * ef * (E().tipos.includes(m.tipo) ? 1.5 : 1) * ((m.precision || 100) / 100);
                if (v > valor) { valor = v; mejor = m; }
            }
            return mejor;
        }

        /* ---------- Efectos visuales de ataque ---------- */
        // modo: proy = proyectiles que viajan | caida = cae desde arriba | sube = surge desde abajo
        //       rayo = descarga | anillo = ondas | impacto = golpe de contacto
        const FX_TIPO = {
            fire:     { modo: 'proy',    forma: 'orbe',    n: 7 },
            water:    { modo: 'proy',    forma: 'gota',    n: 8 },
            electric: { modo: 'rayo',    forma: 'rayo',    n: 1 },
            grass:    { modo: 'proy',    forma: 'hoja',    n: 7 },
            ice:      { modo: 'proy',    forma: 'rombo',   n: 6 },
            poison:   { modo: 'proy',    forma: 'burbuja', n: 6 },
            ghost:    { modo: 'proy',    forma: 'orbe',    n: 4 },
            dark:     { modo: 'proy',    forma: 'orbe',    n: 5 },
            dragon:   { modo: 'proy',    forma: 'orbe',    n: 6 },
            fairy:    { modo: 'proy',    forma: 'estrella', n: 7 },
            psychic:  { modo: 'anillo',  forma: 'anillo',  n: 3 },
            rock:     { modo: 'caida',   forma: 'roca',    n: 6 },
            ground:   { modo: 'sube',    forma: 'roca',    n: 6 },
            normal:   { modo: 'impacto', forma: 'golpe',   n: 1 },
            fighting: { modo: 'impacto', forma: 'golpe',   n: 1 },
            bug:      { modo: 'impacto', forma: 'tajo',    n: 1 },
            steel:    { modo: 'impacto', forma: 'tajo',    n: 1 },
            flying:   { modo: 'impacto', forma: 'tajo',    n: 1 }
        };
        const FX_POS = { j: { x: 26, y: 66 }, e: { x: 76, y: 30 } };   // centro de cada Pokémon (% del campo)
        const modoFx = (tipo) => (FX_TIPO[tipo] || FX_TIPO.normal).modo;

        function pieza(clase, x, y, color, tam) {
            const d = document.createElement('i');
            d.className = 'fx ' + clase;
            d.style.cssText = `left:${x}%;top:${y}%;--c:${color};--t:${tam}%`;
            $fx.appendChild(d);
            return d;
        }

        async function efecto(lado, tipo) {
            if (reduceMotion) { await espera(0); return; }
            const cfg = FX_TIPO[tipo] || FX_TIPO.normal;
            const color = (TIPOS[tipo] && TIPOS[tipo][1]) || '#fff';
            const o = FX_POS[lado], d = FX_POS[lado === 'j' ? 'e' : 'j'];
            const piezas = [];
            const run = (el, frames, ms, delay = 0) => {
                piezas.push(el);
                return el.animate(frames, { duration: ms, delay, easing: 'ease-in', fill: 'both' }).finished.catch(() => {});
            };
            const tareas = [];
            const J = () => rnd(-5, 5);

            if (cfg.modo === 'proy') {
                for (let i = 0; i < cfg.n; i++) {
                    const el = pieza('fx-' + cfg.forma, o.x, o.y, color, 5.5);
                    const arco = rnd(-14, -4);
                    tareas.push(run(el, [
                        { left: o.x + '%', top: o.y + '%', transform: 'translate(-50%,-50%) scale(.4) rotate(0)', opacity: 0 },
                        { left: (o.x + d.x) / 2 + J() + '%', top: (o.y + d.y) / 2 + arco + '%', transform: 'translate(-50%,-50%) scale(1) rotate(180deg)', opacity: 1, offset: .5 },
                        { left: d.x + J() + '%', top: d.y + J() + '%', transform: 'translate(-50%,-50%) scale(1.3) rotate(360deg)', opacity: 0 }
                    ], 520, i * 55));
                }
                await espera(520 + cfg.n * 55 - 150);
                const h = pieza('fx-estallido', d.x, d.y, color, 24);
                tareas.push(run(h, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: .95 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 0 }], 380));
            } else if (cfg.modo === 'caida' || cfg.modo === 'sube') {
                const baja = cfg.modo === 'caida';
                for (let i = 0; i < cfg.n; i++) {
                    const x = d.x + rnd(-9, 9);
                    const el = pieza('fx-roca', x, d.y, baja ? '#9ca3af' : '#a16207', 6);
                    tareas.push(run(el, [
                        { top: (baja ? -8 : 105) + '%', transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 },
                        { top: d.y + rnd(-4, 8) + '%', transform: 'translate(-50%,-50%) rotate(' + rnd(-200, 200) + 'deg)', opacity: 1, offset: .75 },
                        { top: d.y + rnd(-4, 8) + '%', transform: 'translate(-50%,-50%) rotate(' + rnd(-240, 240) + 'deg) scale(.6)', opacity: 0 }
                    ], 560, i * 60));
                }
                await espera(520);
                const h = pieza('fx-estallido', d.x, d.y + 6, '#d6d3d1', 22);
                tareas.push(run(h, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: .8 }, { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0 }], 340));
            } else if (cfg.modo === 'rayo') {
                const el = pieza('fx-rayo', d.x, 0, color, 14);
                el.style.top = '0'; 
                tareas.push(run(el, [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: .2, offset: .3 }, { opacity: 1, offset: .45 }, { opacity: 0 }], 600));
                const h = pieza('fx-estallido', d.x, d.y, color, 28);
                tareas.push(run(h, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(.8)', opacity: .9, offset: .3 }, { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0 }], 600));
                await espera(480);
            } else if (cfg.modo === 'anillo') {
                for (let i = 0; i < cfg.n; i++) {
                    const el = pieza('fx-anillo', d.x, d.y, color, 30);
                    tareas.push(run(el, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }], 600, i * 170));
                }
                await espera(520);
            } else {
                // contacto: golpe seco en el rival (se llama después de la embestida)
                const h = pieza('fx-' + cfg.forma, d.x, d.y, color, 26);
                tareas.push(run(h, [
                    { transform: 'translate(-50%,-50%) scale(.2) rotate(-20deg)', opacity: 1 },
                    { transform: 'translate(-50%,-50%) scale(1) rotate(10deg)', opacity: 1, offset: .35 },
                    { transform: 'translate(-50%,-50%) scale(1.25) rotate(20deg)', opacity: 0 }
                ], 420));
                await espera(260);
            }
            await Promise.all(tareas);
            piezas.forEach((e) => e.remove());
        }

        // Muestra el tipo (elemento) del Pokémon que ataca y el del movimiento
        function tipoFlash(lado, A, mov) {
            const f = document.createElement('div');
            f.className = 'bt-flash ' + (lado === 'j' ? 'f-j' : 'f-e');
            const mt = A.tipos.includes(mov.tipo) ? '' : `<span class="f-mov">Ataque ${insignia(mov.tipo)}</span>`;
            f.innerHTML = `<div class="f-tipos">${A.tipos.map(insignia).join('')}</div>${mt}`;
            $fx.appendChild(f);
            setTimeout(() => f.remove(), 1500);
        }

        async function ataque(lado, mov) {
            const A = lado === 'j' ? J() : E();
            const D = lado === 'j' ? E() : J();
            const nA = lado === 'j' ? nombreJ() : `${nombreE()} salvaje`;
            const imgA = lado === 'j' ? $imgJ : $imgE;
            const imgD = lado === 'j' ? $imgE : $imgJ;
            tipoFlash(lado, A, mov);
            await mensaje(`¡${nA} usó ${mov.nombre}!`, 750);
            if (mov.precision && Math.random() * 100 >= mov.precision) { await mensaje('¡Pero falló!', 800); return; }
            const ef = await efectividad(mov.tipo, D.tipos);
            const contacto = modoFx(mov.tipo) === 'impacto';
            if (contacto) await anim(imgA, lado === 'j' ? 'embiste-j' : 'embiste-e', 380);
            else anim(imgA, 'carga', 300);
            await efecto(lado, mov.tipo);
            if (ef === 0) { await mensaje(`No afecta a ${bonito(D.nombre)}…`, 1000); return; }
            const sA = statsDe(A), sD = statsDe(D);
            const atk = mov.clase === 'special' ? sA.spa : sA.atk;
            const def = mov.clase === 'special' ? sD.spd : sD.def;
            const base = Math.floor(Math.floor(Math.floor(2 * A.nivel / 5 + 2) * mov.poder * atk / def) / 50) + 2;
            const crit = Math.random() < 1 / 16;
            const stab = A.tipos.includes(mov.tipo) ? 1.5 : 1;
            const dano = Math.max(1, Math.floor(base * stab * ef * (crit ? 1.5 : 1) * (0.85 + Math.random() * 0.15)));
            D.hp = Math.max(0, D.hp - dano);
            anim(imgD, 'golpeado', 450);
            if (ef > 1 || crit) { const c = $('#btCampo'); c.classList.remove('tiembla'); void c.offsetWidth; c.classList.add('tiembla'); }
            pintarCampo();
            await espera(520);
            if (crit) await mensaje('¡Golpe crítico!', 700);
            if (ef > 1) await mensaje('¡Es muy eficaz!', 800);
            else if (ef < 1) await mensaje('No es muy eficaz…', 800);
        }

        async function revisar() {
            if (E().hp <= 0) { await victoria(); return true; }
            if (J().hp <= 0) { await jugadorDebil(); return true; }
            return false;
        }

        async function turno(acc) {
            if (!C || C.ocupado) return;
            C.ocupado = true;
            limpiarMenu();
            try {
                const movE = await elegirMovEnemigo();
                if (acc.t === 'mov') {
                    const sJ = statsDe(J()).spe, sE = statsDe(E()).spe;
                    const jPrimero = sJ > sE || (sJ === sE && Math.random() < .5);
                    if (jPrimero) {
                        await ataque('j', acc.mov);
                        if (await revisar()) return;
                        await ataque('e', movE);
                        if (await revisar()) return;
                    } else {
                        await ataque('e', movE);
                        if (await revisar()) return;
                        await ataque('j', acc.mov);
                        if (await revisar()) return;
                    }
                } else if (acc.t === 'bola') {
                    if (await lanzar(acc.tipo)) return;
                    await ataque('e', movE);
                    if (await revisar()) return;
                } else if (acc.t === 'pocion') {
                    S.items[acc.tipo]--;
                    const m = J();
                    const antes = m.hp;
                    m.hp = Math.min(pvMax(m), m.hp + ITEMS[acc.tipo][1]);
                    pintarCampo();
                    await mensaje(`${nombreJ()} recuperó ${m.hp - antes} PS.`, 1000);
                    await ataque('e', movE);
                    if (await revisar()) return;
                } else if (acc.t === 'cambio') {
                    await mensaje(`¡Vuelve, ${nombreJ()}!`, 700);
                    await cambiarA(acc.idx);
                    await ataque('e', movE);
                    if (await revisar()) return;
                } else if (acc.t === 'huir') {
                    const p = C.alfa ? 0.35 : Math.min(0.95, 0.6 + (statsDe(J()).spe / Math.max(1, statsDe(E()).spe)) * 0.2);
                    if (Math.random() < p) {
                        await mensaje('¡Escapaste sin problemas!', 1000);
                        S.stats.racha = 0;
                        return terminar();
                    }
                    await mensaje('¡No pudiste escapar!', 900);
                    await ataque('e', movE);
                    if (await revisar()) return;
                }
                menuPrincipal();
            } catch (err) {
                console.error('Error en el combate:', err);
                aviso('Hubo un problema de conexión durante el combate.');
                C.ocupado = false;
                menuPrincipal();
            }
        }

        // Cartel flotante con el Pokémon que entra (nombre y tipos)
        function cartelCambio(m) {
            const f = document.createElement('div');
            f.className = 'bt-flash f-j cambio';
            f.innerHTML = `<div class="f-nombre">🔄 ¡${m.shiny ? '✨ ' : ''}${esc(bonito(m.nombre))}!</div><div class="f-tipos">${m.tipos.map(insignia).join('')}</div>`;
            $fx.appendChild(f);
            setTimeout(() => f.remove(), 1800);
        }

        async function cambiarA(idx) {
            // El Pokémon actual sale (o ya cayó): se oculta del todo antes de mostrar al nuevo
            if (!$imgJ.classList.contains('cae')) { $imgJ.classList.add('sale-j'); await espera(380); }
            $imgJ.style.visibility = 'hidden';
            $imgJ.classList.remove('sale-j', 'cae', 'entra-j', 'entra-bola');
            C.idx = idx;
            C.participantes.add(J().uid);
            C.movsJ = await cargarMovsJ();
            pintarSprites();
            pintarCampo();
            cartelCambio(J());
            // destello de la Poké Ball al salir
            const o = FX_POS.j;
            const h = pieza('fx-estallido', o.x, o.y, '#ffffff', 26);
            if (!reduceMotion) h.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0 }], { duration: 520, fill: 'both' }).finished.then(() => h.remove()).catch(() => h.remove()); else h.remove();
            await espera(200);
            $imgJ.style.visibility = '';
            anim($imgJ, 'entra-bola', 650);
            await mensaje(`¡Adelante, ${nombreJ()}!`, 1000);
        }

        async function cambiarForzado(idx) {
            limpiarMenu();
            await cambiarA(idx);
            menuPrincipal();
        }

        /* ---------- Combate: captura ---------- */
        async function lanzar(tipo) {
            S.items[tipo]--;
            const m = E();
            const max = pvMax(m);
            const rate = C.enemigo.rate * (C.alfa ? 0.6 : 1);
            const a = ((3 * max - 2 * m.hp) * rate * ITEMS[tipo][1]) / (3 * max);
            const exito = Math.random() < Math.min(1, (a / 255) * 1.2);
            const sacudidas = exito ? 3 : rnd(0, 2);
            await mensaje(`¡Lanzaste una ${nombreItem(tipo)}!`, 500);

            const bola = document.createElement('div');
            bola.className = 'fx-ball ' + (tipo === 'superball' ? 'super' : '');
            // La bola viaja desde tu Pokémon hasta el CENTRO del Pokémon rival y se queda ahí mientras "carga"
            // (la posición se calcula con el tamaño real en pantalla y todo se controla desde JS)
            const rb = $fx.getBoundingClientRect(), re = $imgE.getBoundingClientRect(), rj = $imgJ.getBoundingClientRect();
            const pct = (r) => [(r.left + r.width / 2 - rb.left) / rb.width * 100, (r.top + r.height * 0.5 - rb.top) / rb.height * 100];
            const [ex, ey] = pct(re), [ax, ay] = pct(rj);
            bola.style.cssText = `animation:none;left:${ex.toFixed(1)}%;top:${ey.toFixed(1)}%`;
            $fx.appendChild(bola);
            if (!reduceMotion) bola.animate([
                { left: ax + '%', top: ay + '%', transform: 'translate(-50%,-50%) rotate(0) scale(.7)' },
                { left: (ax + ex) / 2 + '%', top: '8%', transform: 'translate(-50%,-50%) rotate(360deg) scale(1)', offset: .45 },
                { left: ex + '%', top: ey + '%', transform: 'translate(-50%,-50%) rotate(720deg) scale(1)' }
            ], { duration: 820, easing: 'cubic-bezier(.3,.6,.4,1)' });
            await espera(820);
            $imgE.classList.add('capturando');
            await espera(500);
            for (let i = 0; i < sacudidas; i++) {
                bola.style.animation = 'tambalear .75s ease-in-out';
                await espera(750);
                bola.style.animation = 'none';
                await espera(300);
            }
            if (!exito) {
                bola.remove();
                $imgE.classList.remove('capturando');
                await mensaje(sacudidas === 0 ? '¡Oh, no! ¡El Pokémon se escapó!' : sacudidas === 1 ? '¡Ya casi lo tenías!' : '¡Qué cerca! Se liberó.', 1100);
                return false;
            }
            bola.style.animation = 'exito .8s ease-out both';
            await mensaje(`¡Genial! ¡${nombreE()} fue capturado!${E().shiny ? ' ✨' : ''}${C.legendario ? ' 👑' : ''}`, 1300);
            await premioCaptura();
            const capturado = E();
            capturado.nivel = Math.max(capturado.nivel, 1);
            if (S.equipo.length < MAX_EQUIPO) { S.equipo.push(capturado); await mensaje(`${bonito(capturado.nombre)} se unió a tu equipo.`, 1000); }
            else { S.caja.push(capturado); await mensaje(`Tu equipo está completo. ${bonito(capturado.nombre)} fue enviado a la Caja.`, 1200); }
            if (!S.registro.includes(capturado.id)) S.registro.push(capturado.id);
            S.stats.capturas++;
            if (capturado.shiny) S.stats.shinys++;
            if (C.legendario) S.stats.legendarios++;
            S.stats.racha++;
            S.stats.mejorRacha = Math.max(S.stats.mejorRacha, S.stats.racha);
            if (S.equipo.length === MAX_EQUIPO && !S.equipoCompleto) {
                S.equipoCompleto = true;
                await mensaje('🏆 ¡Completaste tu equipo de 6 Pokémon!', 1600);
            }
            if (C.campana) { await finCampana(true); return true; }
            terminar();
            return true;
        }

        /* ---------- Combate: resultado ---------- */
        async function jugadorDebil() {
            await anim($imgJ, 'cae', 700);
            await mensaje(`¡${nombreJ()} se debilitó!`, 1100);
            if (!S.equipo.some((m) => m.hp > 0)) {
                await mensaje('Te quedaste sin Pokémon… Corrés al Centro Pokémon.', 1600);
                S.stats.racha = 0;
                S.equipo.forEach((m) => { m.hp = pvMax(m); });
                if (C.campana) {
                    const prog = S.campana[S.dif];
                    if (S.dif !== 'facil') { prog.combate = 0; prog.bono = 0; resultadoCamino = '<div class="resultado perdiste">Perdiste y volvés al inicio de la etapa.</div>'; }
                    else resultadoCamino = '<div class="resultado perdiste">Perdiste. Podés repetir el combate.</div>';
                }
                terminar();
                return;
            }
            menuCambio(true);
            C.ocupado = false;
        }

        // Reparte la experiencia: los que pelearon cobran completo; el resto del equipo (vivo) cobra el 40 %
        async function repartirXP(mult) {
            const base = Math.floor(E().expBase * E().nivel / 5 * (C.alfa ? 1.8 : 1) * (C.lider ? 1.3 : 1) * mult);
            const vivos = S.equipo.filter((m) => C.participantes.has(m.uid) && m.hp > 0);
            const cada = Math.max(1, Math.floor(base / Math.max(1, vivos.length)));
            for (const m of vivos) {
                await mensaje(`${bonito(m.nombre)} ganó ${cada} EXP.`, 900);
                await ganarXP(m, cada);
            }
            const banca = S.equipo.filter((m) => !C.participantes.has(m.uid) && m.hp > 0 && m.nivel < 100);
            if (banca.length) {
                const extra = Math.max(1, Math.floor(cada * 0.4));
                await mensaje(`El resto del equipo ganó ${extra} EXP.`, 900);
                for (const m of banca) await ganarXP(m, extra);
            }
        }

        // Recompensa por capturar: TODO el equipo gana experiencia completa (no se divide)
        async function premioCaptura() {
            const rival = E();
            const bono = (C.alfa ? 1.8 : 1) * (C.legendario ? 2 : 1) * (rival.shiny ? 1.5 : 1);
            const cada = Math.max(5, Math.floor(rival.expBase * rival.nivel / 5 * 0.8 * bono));
            const equipo = S.equipo.filter((m) => m.hp > 0 && m.nivel < 100);
            if (!equipo.length) return;
            await mensaje(`🎁 ¡Recompensa por captura! Todo tu equipo gana ${cada} EXP.`, 1500);
            for (const m of equipo) await ganarXP(m, cada);
        }

        async function victoria() {
            await anim($imgE, 'cae', 700);
            await mensaje(`¡${nombreE()} se debilitó!`, 1000);
            await repartirXP(1);
            S.stats.victorias++;
            S.stats.racha++;
            S.stats.mejorRacha = Math.max(S.stats.mejorRacha, S.stats.racha);
            if (C.campana) { await mensaje(C.lider ? '🏅 ¡Venciste al líder!' : '¡Combate superado!', 1200); return finCampana(false); }
            await premios();
            terminar();
        }

        async function premios() {
            const ganado = [];
            const sumar = (k, n) => { S.items[k] += n; ganado.push(`${n} ${nombreItem(k)}`); };
            if (Math.random() < .65) sumar('pokeball', rnd(1, 2));
            if (Math.random() < .3) sumar('pocion', 1);
            if (C.alfa) { sumar('superball', 2); sumar('superpocion', 1); }
            else if (Math.random() < .12) sumar('superball', 1);
            if (S.items.pokeball + S.items.superball === 0) sumar('pokeball', 3);
            if (ganado.length) await mensaje(`Encontraste: ${ganado.join(', ')}.`, 1500);
        }

        async function ganarXP(m, cant) {
            if (m.nivel >= 100) return;
            m.xp += cant;
            while (m.nivel < 100 && m.xp >= xpNecesaria(m.nivel)) {
                m.xp -= xpNecesaria(m.nivel);
                const antes = pvMax(m);
                m.nivel++;
                if (m.hp > 0) m.hp += pvMax(m) - antes;
                await mensaje(`¡${bonito(m.nombre)} subió al nivel ${m.nivel}!`, 1200);
                if (J() === m) {
                    pintarCampo();
                    try {
                        const antes = new Set(C.movsJ.filter((x) => !x.bloqueado).map((x) => x.name));
                        C.movsJ = await cargarMovsJ();
                        for (const n of C.movsJ.filter((x) => !x.bloqueado && !antes.has(x.name)).slice(0, 2)) await mensaje(`¡${bonito(m.nombre)} aprendió ${n.nombre}!`, 1300);
                    } catch (e) { /* conserva los anteriores */ }
                }
                await evolucionar(m);
            }
            if (m.nivel >= 100) m.xp = 0;
            if (J() === m) pintarCampo();
        }

        function buscarNodo(nodo, id) {
            if (idDeUrl(nodo.species.url) === id) return nodo;
            for (const h of nodo.evolves_to) { const r = buscarNodo(h, id); if (r) return r; }
            return null;
        }

        function nivelEvolucion(h) {
            const d = h.evolution_details[0] || {};
            if (d.min_level) return d.min_level;
            if (d.trigger && d.trigger.name === 'level-up') return 25;
            return 30;
        }

        async function evolucionar(m) {
            let sp, cadena;
            try {
                sp = await api('/pokemon-species/' + m.id);
                if (!sp.evolution_chain) return;
                cadena = await api(sp.evolution_chain.url);
            } catch (e) { return; }
            const nodo = buscarNodo(cadena.chain, m.id);
            if (!nodo) return;
            const posibles = nodo.evolves_to.filter((h) => nivelEvolucion(h) <= m.nivel && idDeUrl(h.species.url) <= TOTAL);
            if (!posibles.length) return;
            const destino = posibles[rnd(0, posibles.length - 1)];
            const nuevoId = idDeUrl(destino.species.url);
            let p;
            try { p = await api('/pokemon/' + nuevoId); } catch (e) { return; }
            const viejo = bonito(m.nombre);
            await mensaje(`¿Qué? ¡${viejo} está evolucionando!`, 1300);
            const activo = J() === m;
            if (activo) await anim($imgJ, 'evoluciona', 1500);
            const maxAntes = pvMax(m);
            m.id = p.id; m.nombre = p.name; m.tipos = p.types.map((t) => t.type.name); m.base = baseDe(p); m.expBase = p.base_experience || m.expBase;
            if (m.hp > 0) m.hp += pvMax(m) - maxAntes;
            if (!S.registro.includes(m.id)) S.registro.push(m.id);
            if (activo) { pintarSprites(); pintarCampo(); try { C.movsJ = await cargarMovsJ(); } catch (e) { /* conserva */ } }
            await mensaje(`¡Felicitaciones! ¡${viejo} evolucionó a ${bonito(m.nombre)}!`, 1700);
        }

        function terminar() {
            guardarAv();
            C = null;
            limpiarMenu();
            $imgE.classList.remove('capturando', 'cae'); $imgJ.classList.remove('cae');
            $fx.innerHTML = '';
            sel = null;
            renderHub();
            mostrar('hub');
        }

        /* Imagen caída: usar el sprite chico como alternativa */
        document.addEventListener('error', (e) => {
            const img = e.target;
            if (img && img.tagName === 'IMG' && img.dataset && img.dataset.id && !img.dataset.fb && $vista.contains(img)) {
                img.dataset.fb = '1';
                img.src = SPRITE(img.dataset.id);
            }
        }, true);

        renderInicio();
        return { entrar };
    })();

    /* ------------------------------------------------------------
       Inicio
       ------------------------------------------------------------ */
    cargarLista();
})();