/* dc-lite: renderiza as páginas do canvas (formato .dc.html) como site comum */
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(p) {
      var next = typeof p === 'function' ? p(this.state) : p;
      this.state = Object.assign({}, this.state, next);
      DCLite.schedule();
    }
    forceUpdate() { DCLite.schedule(); }
  }
  window.DCLogic = DCLogic;

  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var comp, tpl, app, handlers, hid, pending = false;

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^(['"]).*\1$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.');
    var s = scope;
    while (s) {
      if (Object.prototype.hasOwnProperty.call(s, parts[0])) {
        var v = s[parts[0]];
        for (var i = 1; i < parts.length; i++) v = v == null ? undefined : v[parts[i]];
        return v;
      }
      s = s.__parent;
    }
    return undefined;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
  }
  function reg(fn) { var id = 'h' + (hid++); handlers[id] = fn; return id; }

  function renderInto(src, scope, out) {
    src.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { out.appendChild(document.createTextNode(interp(n.nodeValue, scope))); return; }
      if (n.nodeType !== 1) return;
      var tag = n.localName;
      if (tag === 'sc-for') {
        var list = lookup((n.getAttribute('list') || '').replace(/^\s*\{\{|\}\}\s*$/g, ''), scope) || [];
        var as = n.getAttribute('as') || 'item';
        list.forEach(function (item, idx) {
          var sc = { __parent: scope, $index: idx }; sc[as] = item;
          renderInto(n, sc, out);
        });
        return;
      }
      if (tag === 'sc-if') {
        var v = lookup((n.getAttribute('value') || '').replace(/^\s*\{\{|\}\}\s*$/g, ''), scope);
        if (v) renderInto(n, scope, out);
        return;
      }
      var el = n.namespaceURI && n.namespaceURI !== 'http://www.w3.org/1999/xhtml'
        ? document.createElementNS(n.namespaceURI, n.tagName)
        : document.createElement(tag);
      Array.prototype.forEach.call(n.attributes, function (a) {
        var name = a.name, val = a.value;
        if (/^hint-/.test(name)) return;
        if (/^on[a-z]+$/.test(name)) {
          var m = WHOLE.exec(val); var fn = m ? lookup(m[1], scope) : null;
          if (typeof fn === 'function') el.setAttribute('data-h-' + name.slice(2), reg(fn));
          return;
        }
        var w = WHOLE.exec(val);
        var out2 = w ? lookup(w[1], scope) : interp(val, scope);
        el.setAttribute(name, out2 == null ? '' : String(out2));
      });
      renderInto(n, scope, el);
      out.appendChild(el);
    });
  }

  function render() {
    pending = false;
    handlers = {}; hid = 0;
    var vals = comp.renderVals ? comp.renderVals() : {};
    var next = document.createElement('div'); next.id = 'app';
    renderInto(tpl.content, vals, next);
    window.morphdom(app, next, {
      onBeforeElUpdated: function (from, to) {
        if (from.tagName === 'DETAILS') { if (from.open) to.setAttribute('open', ''); else to.removeAttribute('open'); }
        if ((from.tagName === 'INPUT' || from.tagName === 'TEXTAREA' || from.tagName === 'SELECT')) {
          if (from.type === 'checkbox' || from.type === 'radio') { to.checked = from.checked; }
          else if (!to.hasAttribute('value')) { to.value = from.value; }
        }
        return true;
      }
    });
  }

  function delegate(type) {
    app.addEventListener(type, function (e) {
      var el = e.target.closest && e.target.closest('[data-h-' + type + ']');
      if (!el || !app.contains(el)) return;
      var fn = handlers[el.getAttribute('data-h-' + type)];
      if (fn) fn(e);
    });
  }

  window.DCLite = {
    schedule: function () { if (!pending) { pending = true; requestAnimationFrame(render); } },
    mount: function () {
      tpl = document.getElementById('dc-template');
      app = document.getElementById('app');
      var code = document.getElementById('dc-logic').textContent;
      var Component = new Function(code + '\n;return Component;')();
      comp = new Component({});
      ['click', 'input', 'change'].forEach(delegate);
      render();
      if (comp.componentDidMount) comp.componentDidMount();
      app.addEventListener('submit', function (e) { e.preventDefault(); }, true);
    }
  };
})();
