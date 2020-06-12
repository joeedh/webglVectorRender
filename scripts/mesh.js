var _mesh = undefined;

define([
  "util", "vectormath", "math"
], function(util, vectormath, math) {
  'use strict';
  
  var exports = _mesh = {};

  //var patch_canvas2d = canvas_patch.patch_canvas2d;
  var Vector2 = vectormath.Vector2, Vector3 = vectormath.Vector3;
  var Vector4 = vectormath.Vector4, Matrix4 = vectormath.Matrix4;
  
  var MeshTypes = exports.MeshTypes = {
    VERTEX     : 1,
    EDGE       : 2,
    HANDLE     : 4,
    LOOP       : 8,
    LOOPLIST   : 16,
    FACE       : 32
  };
  
  var MeshFlags = exports.MeshFlags = {
    SELECT : 1,
    HIDE   : 2
  };
  
  var Element = exports.Element = class Element {
    constructor(type) {
      this.type = type;
      this.flag = this.index = 0;
      this.eid = -1;
    }
    
    [Symbol.keystr]() {
      return this.eid;
    }
    
    toJSON() {
      return {
        type  : this.type,
        flag  : this.flag,
        index : this.index,
        eid   : this.eid
      };
    }
    
    loadJSON(obj) {
      this.type = obj.type;
      this.flag = obj.flag;
      this.index = obj.index;
      this.eid = obj.eid;
      
      return this;
    }
  }
  
  //has Vector3 mixin
  var Vertex = exports.Vertex = class Vertex extends Element {
    constructor(co) {
      super(MeshTypes.VERTEX);
      this.initVector3();
      
      if (co !== undefined) {
        this.load(co);
      }
      
      this.edges = [];
    }
    
    toJSON() {
      var edges = [];
      for (var e of this.edges) {
        edges.push(e.eid);
      }
      
      return util.merge(super.toJSON(), {
        0 : this[0],
        1 : this[1],
        2 : this[2],
        edges : edges
      });
    }

    otherEdge(e) {
      if (this.edges.length != 2) {
        throw new Error ("otherEdge only works on 2-valence vertices");
      }

      if (e === this.edges[0])
        return this.edges[1];
      else if (e === this.edges[1])
        return this.edges[0];
    }

    loadJSON(obj) {
      super.loadJSON(obj);
      
      this.edges = obj.edges;
      this[0] = obj[0];
      this[1] = obj[1];
      this[2] = obj[2];
      
      return this;
    }
  }
  util.mixin(Vertex, Vector3);

  
  //has Vector3 mixin
  var Handle = exports.Handle = class Handle extends Element {
    constructor(co) {
      super(MeshTypes.HANDLE);
      this.initVector3();
      
      if (co !== undefined) {
        this.load(co);
      }
      
      this.owner = undefined;
    }
    
    toJSON() {
      return Object.assign({
        0     :   this[0],
        1     :   this[1],
        owner :   this.owner ? this.owner.eid : -1
      }, super.toJSON());
    }
    
    loadJSON(obj) {
      super.loadJSON(obj);
      
      this[0] = obj[0];
      this[1] = obj[1];
      this.owner = obj.owner;
      
      return this;
    }
  }
  util.mixin(Handle, Vector3);
  
  var _evaluate_vs = util.cachering.fromConstructor(Vector3, 64);
  
  var Edge = exports.Edge = class Edge extends Element {
    constructor() {
      super(MeshTypes.EDGE);
      
      this.h1 = this.h2 = undefined;
      this.v1 = this.v2 = undefined;
      this.l = undefined;
    }
    
    evaluate(t) {
      return _evaluate_vs.next().load(this.v1).interp(this.v2, t);
    }
    
    derivative(t) {
      var df = 0.0001;
      var a = this.evaluate(t-df);
      var b = this.evaluate(t+df);
      
      return b.sub(a).mulScalar(0.5/df);
    }
    
    derivative2(t) {
      var df = 0.0001;
      var a = this.derivative(t-df);
      var b = this.derivative(t+df);
      
      return b.sub(a).mulScalar(0.5/df);
    }
    
    curvature(t) {
      let dv1 = this.derivative(t);
      let dv2 = this.derivative2(t);
      
      let ret = (dv1[0]*dv2[1] - dv1[1]*dv2[0]) / Math.pow(dv1.dot(dv1), 3.0/2.0);
       
      return ret;
    }
    
    toJSON() {
      return util.merge(super.toJSON(), {
        v1 : this.v1.eid,
        v2 : this.v2.eid,

        h1 : this.h1.eid,
        h2 : this.h2.eid,
        l  : this.l ? this.l.eid : -1
      });
    }
    
    loadJSON(obj) {
      super.loadJSON(obj);
      
      this.v1 = obj.v1;
      this.v2 = obj.v2;

      this.h1 = obj.h1;
      this.h2 = obj.h2;
      this.l = obj.l;
      
      return this;
    }
    
    otherVertex(v) {
      if (v === undefined)
        throw new Error("v cannot be undefined in Edge.prototype.otherVertex()");
      
      if (v === this.v1)
        return this.v2;
      if (v === this.v2)
        return this.v1;
      
      throw new Error("vertex " + v.eid + " not in edge");
    }
  };
  
  var Loop = exports.Loop = class Loop extends Element {
    constructor() {
      super(MeshTypes.LOOP);
      
      this.f = undefined;
      this.radial_next = undefined;
      this.radial_prev = undefined;
      this.v = undefined;
      this.e = undefined;
      this.next = undefined;
      this.prev = undefined;
      this.list = undefined;
    }
    
    toJSON() {
      return Object.assign({
        v           : this.v.eid,
        e           : this.e.eid,
        f           : this.f.eid,
        radial_next : this.radial_next.eid,
        radial_prev : this.radial_prev.eid,
        next        : this.next.eid,
        prev        : this.prev.eid,
        list        : this.list.eid
      }, super.toJSON());
    }
    
    loadJSON(obj) {
      super.loadJSON(obj);
      
      this.v = obj.v;
      this.e = obj.e;
      this.f = obj.f;

      this.radial_next = obj.radial_next;
      this.radial_prev = obj.radial_prev;

      this.next = obj.next;
      this.prev = obj.prev;

      this.list = obj.list;
      
      return this;
    }
  }
  
  var LoopList = exports.LoopList = class LoopList extends Element {
    constructor() {
      super(MeshTypes.LOOPLIST);
      
      this.start = undefined;
      this.end = undefined;
    }
    
    [Symbol.iterator]() {
      let this2 = this;
      return (function*() {
        let l = this2.start;
        let _i = 0;
        
        do {
          if (_i++ > 10000) {
            console.warn("Infinite loop detected!");
            break;
          }
          
          yield l;
          
          l = l.next;
        } while (l !== this2.start);
      })();
    }
    
    get verts() {
      let this2 = this;
      return (function*() {
        for (let l of this2) {
          yield l.v;
        }
      })();
    }
    
    toJSON() {
      return Object.assign({
        start : this.start.eid,
        end   : this.end.eid
      }, super.toJSON());
    }
    
    loadJSON(obj) {
      super.loadJSON(obj);
      
      this.start = obj.start;
      this.end = obj.end;
      
      return this;
    }
  }
  
  class Face extends Element {
    constructor() {
      super(MeshTypes.FACE);
      this.lists = [];
      this.blur = 0.0;
    }
    
    toJSON() {
      let lists = [];
      
      for (let list of this.lists) {
        lists.push(list.eid);
      }
      
      return Object.assign({
        lists : lists,
        blur  : this.blur
      }, super.toJSON());
    }
    
    loadJSON(obj) {
      super.loadJSON(obj);
      
      this.lists = obj.lists;
      this.blur = obj.blur || 0.0;
      
      return this;
    }
    
    get loops() {
      let this2 = this;
      let ret = (function*() {
        for (let list of this2.lists) {
          for (let l of list) {
            yield l;
          }
        }
      })();
      Object.defineProperty(ret, "length", {
        get : function() {
          let count = 0;
          for (let list of this2.lists) {
            for (let l of list) {
              count++;
            }
          }
          
          return count;
        }
      });
      
      return ret;
    }
    
    get verts() {
      let this2 = this;
      let ret = (function*() {
        for (let list of this.lists) {
          for (let l of list) {
            yield l.v;
          }
        }
      })();
      
      Object.defineProperty(ret, "length", {
        get : function() {
          let count = 0;
          for (let list of this2.lists) {
            for (let l of list) {
              count++;
            }
          }
          
          return count;
        }
      });
      
      return ret;
    }
  }
  
  var ElementArray = exports.ElementArray = class ElementArray extends Array {
    constructor(type) {
      super();
      
      this.type = type;
      this.selected = new util.set();
      this.on_selected = undefined;
      this.highlight = this.active = undefined;
    }
    
    toJSON() {
      var arr = [];
      for (var i=0; i<this.length; i++) {
        arr.push(this[i]);
      }
      
      var sel = [];
      for (var v of this.selected) {
        sel.push(v.eid);
      }
      
      return {
        type      : this.type,
        array     : arr,
        selected  : sel,
        active    : this.active !== undefined ? this.active.eid : -1,
        highlight : this.highlight !== undefined ? this.highlight.eid : -1
      };
    }
    
    loadJSON(obj) {
      this.length = 0;
      this.selected = new util.set();
      this.active = this.highlight = undefined;
      this.type = obj.type;
      
      for (var e of obj.array) {
        var e2 = undefined;
        
        switch (e.type) {
          case MeshTypes.VERTEX:
            e2 = new Vertex();
            break;
          case MeshTypes.HANDLE:
            e2 = new Handle();
            break;
          case MeshTypes.EDGE:
            e2 = new Edge();
            break;
          case MeshTypes.LOOP:
            e2 = new Loop();
            break;
          case MeshTypes.LOOPLIST:
            e2 = new LoopList();
            break;
          case MeshTypes.FACE:
            e2 = new Face();
            break;
          default:
            console.log(e);
            throw new Error("bad element " + e);
        }
        
        e2.loadJSON(e);
        super.push(e2);
        if (e2.flag & MeshFlags.SELECT) {
          this.selected.add(e2);
        }
        
        if (e2.eid == obj.active) {
          this.active = e2;
        } else if (e2.eid == obj.highlight) {
          this.highlight = e2;
        }
      }
    }
    
    push(v) {
      super.push(v);
      
      if (v.flag & MeshFlags.SELECT) {
        this.selected.add(v);
      }
      
      return this;
    }
    
    remove(v) {
      if (this.selected.has(v)) {
        this.selected.remove(v);
      }
      
      if (this.active === v)
        this.active = undefined;
      if (this.highlight === v)
        this.highlight = undefined;
      
      super.remove(v);
      
      return this;
    }
    
    selectNone() {
      for (var e of this) {
        this.setSelect(e, false);
      }
    }
    
    selectAll() {
      for (var e of this) {
        this.setSelect(e, true);
      }
    }
    
    setSelect(v, state) {
      if (state) {
        v.flag |= MeshFlags.SELECT;
        
        this.selected.add(v);
      } else {
        v.flag &= ~MeshFlags.SELECT;
        
        this.selected.remove(v, true);
      }
      
      return this;
    }
  };
  
  var Mesh = exports.Mesh = class Mesh {
    constructor() {
      this.eidgen = new util.IDGen();
      this.eidmap = {};
  
      this.elists = {};
      
      this.makeElists();
    }
    
    makeElists() {
      let make = (key, type) => {
        this[key] = this.elists[type] = new ElementArray(type);
      }
      
      make("verts", MeshTypes.VERTEX);
      make("edges", MeshTypes.EDGE);
      make("handles", MeshTypes.HANDLE);
      make("loops", MeshTypes.LOOP);
      make("lists", MeshTypes.LOOPLIST);
      make("faces", MeshTypes.FACE);
    }
    
    _element_init(e) {
      e.eid = this.eidgen.next();
      this.eidmap[e.eid] = e;
    }
    
    makeVertex(co) {
      var v = new Vertex(co);
      
      this._element_init(v);
      this.verts.push(v);
      
      return v;
    }
    
    makeHandle(co) {
      let h = new Handle(co);
      this._element_init(h);
      this.handles.push(h);
      return h;
    }
    
    getEdge(v1, v2) {
      for (var e of v1.edges) {
        if (e.otherVertex(v1) === v2)
          return e;
      }
      
      return undefined;
    }
    
    makeEdge(v1, v2) {
      var e = new Edge();
      
      e.v1 = v1;
      e.v2 = v2;
      
      e.h1 = this.makeHandle(v1);
      e.h1.interp(v2, 1.0/2.0);
      e.h1.owner = e;

      e.h2 = this.makeHandle(v2);
      e.h2.interp(v2, 2.0/3.0);
      e.h2.owner = e;

      v1.edges.push(e);
      v2.edges.push(e);
      
      this._element_init(e);
      this.edges.push(e);
      
      return e;
    }
    
    killVertex(v) {
      if (v.eid === -1) {
        console.trace("Warning: vertex", v.eid, "already freed", v);
        return;
      }
      
      var _i = 0;
      while (v.edges.length > 0 && _i++ < 10000) {
        this.killEdge(v.edges[0]);
      }
      
      if (_i >= 10000) {
        console.trace("mesh integrity warning, infinite loop detected in killVertex");
      }
      
      delete this.eidmap[v.eid];
      this.verts.remove(v);
      v.eid = -1;
    }
    
    killEdge(e) {
      if (e.eid === -1) {
        console.trace("Warning: edge", e.eid, "already freed", e);
        return;
      }
      
      delete this.eidmap[e.eid];
      this.edges.remove(e);
      
      delete this.eidmap[e.h1.eid];
      this.handles.remove(e.h1);

      delete this.eidmap[e.h2.eid];
      this.handles.remove(e.h2);

      e.eid = -1;
      
      e.v1.edges.remove(e);
      e.v2.edges.remove(e);
    }
    
    radialLoopRemove(e, l) {
      if (e.l === l) {
        e.l = e.l.radial_next;
      }
      
      if (e.l === l) {
        e.l = undefined;
        return;
      }
      
      l.radial_next.radial_prev = l.radial_prev;
      l.radial_prev.radial_next = l.radial_next;
    }
    
    radialLoopInsert(e, l) {
      if (!e.l) {
        e.l = l;
        l.radial_next = l.radial_prev = l;
      } else {
        l.radial_prev = e.l;
        l.radial_next = e.l.radial_next;
        
        e.l.radial_next.radial_prev = l;
        e.l.radial_next = l;
      }
    }
    
    makeFace(vs) {
      let f = new Face();
      this._element_init(f);
      this.faces.push(f);
      
      let list = new LoopList();
      this._element_init(list);
      this.lists.push(list);
      
      let lastl, firstl;
      
      for (let i=0; i<vs.length; i++) {
        let v1 = vs[i], v2 = vs[(i+1)%vs.length];
        
        let e = this.getEdge(v1, v2);
        if (!e) {
          e = this.makeEdge(v1, v2);
        }
        
        let l = new Loop();
        this._element_init(l);
        this.loops.push(l);
        
        l.v = v1;
        l.e = e;
        l.f = f;
        l.list = list;
        
        this.radialLoopInsert(e, l);
        
        if (!firstl) {
          firstl = l;
        } else {
          lastl.next = l;
          l.prev = lastl;
        }
        
        lastl = l;
      }
      
      firstl.prev = lastl;
      lastl.next = firstl;
      
      list.start = firstl;
      list.end = lastl;
      
      f.lists.push(list);
      return f;
      /*
        f           : this.f.eid,
        radial_next : this.radial_next.eid,
        radial_prev : this.radial_prev.eid,
        v           : this.v.eid,
        e           : this.e.eid,
        next        : this.next.eid,
        prev        : this.prev.eid,
        list        : this.list.eid
      */
    }
    
    selectFlush(selmode) {
      if (selmode & MeshTypes.VERTEX) {
        this.edges.selectNone();
        var set_active = this.edges.active === undefined;
        set_active = set_active || !((this.edges.active.v1.flag|this.edges.active.v2.flag) & MeshFlags.SELECT);
        
        for (var e of this.edges) {
          if ((e.v1.flag & MeshFlags.SELECT) && (e.v2.flag & MeshFlags.SELECT)) {
            this.edges.setSelect(e, true);

            this.handles.setSelect(e.h1, true);
            this.handles.setSelect(e.h2, true);

            if (set_active) {
              this.edges.active = e;
            }
          }
        }
        
        for (var f of this.faces) {
          let ok = true;
          
          for (var l of f.loops) {
            if (!(l.e.flag & MeshFlags.SELECT)) {
              ok = false;
              break;
            }
          }
          
          if (ok) {
            this.faces.setSelect(f, true);
          }
        }
      } else if (selmode & MeshTypes.EDGE) {
        this.verts.selectNone();
        
        for (var v of this.verts) {
          for (var e of v.edges) {
            if (e.flag & MeshFlags.SELECT) {
              this.verts.setSelect(v, true);
              break;
            }
          }
        }
      }
    }
    
    splitEdge(e, t) {
      t = t === undefined ? 0.5 : t;
      
      var nv = this.makeVertex(e.v1).interp(e.v2, t);
      var ne = this.makeEdge(nv, e.v2);
      
      e.v2.edges.remove(e);
      e.v2 = nv;
      nv.edges.push(e);
      
      let h1 = new Vector2(e.h1);
      let h2 = new Vector2(e.h2);

      //e.h.interp(e.v1, 1.0/3.0);
      //ne.h.load(h).interp(ne.v2, 0.5);
      //nv.interp(h, 0.5);

      ne.h1.load(nv).interp(ne.v2, 1.0/3.0);
      ne.h1.load(nv).interp(ne.v2, 2.0/3.0);

      e.h2.load(e.v1).interp(nv, 2.0/3.0);
      
      if (e.flag & MeshFlags.SELECT) {
        this.edges.setSelect(ne, true);
        this.verts.setSelect(nv, true);
      }
      
      if (e.l) {
        let l = e.l;
        let ls = [];
        let _i = 0;
        do {
          if (_i++ > 10000) {
            console.warn("infinite loop detected");
            break;
          }
          
          ls.push(l);
          l = l.radial_next;
        } while (l !== e.l);
        
        for (let l of ls) {
          let l2 = new Loop();
          this._element_init(l2);
          this.loops.push(l2);
          
          l2.f = l.f;
          l2.list = l.list;
          
          if (l.e === e) {
            l2.v = nv;
            l2.e = ne;
            l2.prev = l;
            l2.next = l.next;
            l.next.prev = l2;
            l.next = l2;
            
            this.radialLoopInsert(ne, l2);
          } else {
            this.radialLoopRemove(e, l);
            
            l2.v = nv;
            l.e = ne;
            l2.e = e;
            
            this.radialLoopInsert(ne, l);
            this.radialLoopInsert(e, l2);
            
            l.next.prev = l2;
            l2.prev = l;
            l2.next = l.next;
            l.next = l2;
            
            /*
           v1 <--l2--<--l--- v2
               --e1--|--ne--
               --l--->--l2-->
            
            */
          }
        }
      }
      
      return [ne, nv];
    }
    
    hasHighlight() {
      return this.verts.highlight || this.edges.highlight || this.handles.highlight;
    }
    
    clearHighlight() {
      let exist = this.hasHighlight();
      
      this.verts.highlight = this.edges.highlight = this.handles.highlight = undefined;
      return exist;
    }
    
    dissolveVertex(v) {
      if (v.edges.length != 2) {
        throw new Error("can't dissolve vertex with more than two edges");
      }
      
      var e1 = v.edges[0], e2 = v.edges[1];
      var v1 = e1.otherVertex(v), v2 = e2.otherVertex(v);
      
      var flag = (e1.flag | e2.flag) & ~MeshFlags.HIDE;
      
      this.killVertex(v);
      var e3 = this.makeEdge(v1, v2);
      
      if (flag & MeshFlags.SELECT) {
        this.edges.setSelect(e3, true);
      }
      
      e3.flag |= flag;
    }
    
    getList(type) {
      return this.elists[type];
    }
    
    toJSON() {
      return {
        eidgen   : this.eidgen,
        verts    : this.verts,
        edges    : this.edges,
        loops    : this.loops,
        lists    : this.lists,
        faces    : this.faces,
        handles  : this.handles
      };
    }
    
    loadJSON(obj) {
      this.makeElists();
      
      this.eidgen.loadJSON(obj.eidgen);
      this.eidmap = {};
      
      this.verts.loadJSON(obj.verts);
      this.edges.loadJSON(obj.edges);
      
      for (var v of this.verts) {
        this.eidmap[v.eid] = v;
      }
      
      for (var e of this.edges) {
        this.eidmap[e.eid] = e;
        e.v1 = this.eidmap[e.v1];
        e.v2 = this.eidmap[e.v2];
      }
      
      if (obj.handles) {
        this.handles.loadJSON(obj.handles);
        for (let h of this.handles) {
          this.eidmap[h.eid] = h;
        }

        for (let e of this.edges) {
          if (e.h1 === undefined) {
            e.h1 = this.makeHandle();
            e.h2 = this.makeHandle();

            e.h1.load(e.v1).interp(e.v2, 1.0/3.0);
            e.h2.load(e.v1).interp(e.v2, 2.0/3.0);
          } else {
            e.h1 = this.eidmap[e.h1];
            e.h2 = this.eidmap[e.h2];
          }

          e.h1.owner = e;
          e.h2.owner = e;
        }
      } else {
        for (let e of this.edges) {
          e.h1 = this.makeHandle();
          e.h2 = this.makeHandle();

          e.h1.load(e.v1).interp(e.v2, 1.0/3.0);
          e.h2.load(e.v1).interp(e.v2, 2.0/3.0);
          e.h1.owner = e;
          e.h2.owner = e;
        }
      }

      let badh = [];
      for (let h of this.handles) {
        if (h.owner === undefined || typeof h.owner === "number") {
          badh.push(h);
        }
      }

      for (let h of badh) {
        delete this.eidmap[h.eid];
        this.handles.remove(h);
      }
      
      for (var v of this.verts) {
        for (var i=0; i<v.edges.length; i++) {
          v.edges[i] = this.eidmap[v.edges[i]];
        }
      }
      
      if (!obj.loops) {
        return this;
      }
      
      this.loops.loadJSON(obj.loops);
      this.lists.loadJSON(obj.lists);
      this.faces.loadJSON(obj.faces);
      
      for (let l of this.loops) {
        this.eidmap[l.eid] = l;
        
        l.e = this.eidmap[l.e];
        l.v = this.eidmap[l.v];
      }
      
      for (let list of this.lists) {
        this.eidmap[list.eid] = list;
        
        list.start = this.eidmap[list.start]
        list.end = this.eidmap[list.end];
      }
      
      for (let f of this.faces) {
        this.eidmap[f.eid] = f;
        
        for (let i=0; i<f.lists.length; i++) {
          f.lists[i] = this.eidmap[f.lists[i]];
        }
      }
      
      for (let e of this.edges) {
        e.l = e.l !== undefined ? this.eidmap[e.l] : undefined;
      }
      
      for (let l of this.loops) {
        l.next = this.eidmap[l.next];
        l.prev = this.eidmap[l.prev];
        l.radial_next = this.eidmap[l.radial_next];
        l.radial_prev = this.eidmap[l.radial_prev];
        l.f = this.eidmap[l.f];
        l.list = this.eidmap[l.list];
      }
      
      return this;
    }
    
    setSelect(e, state) {
      this.getList(e.type).setSelect(e, state);
    }
    
    selectNone() {
      this.verts.selectNone();
      this.edges.selectNone();
    }
    
    selectAll() {
      this.verts.selectAll();
      this.edges.selectAll();
    }
    
    get elements() {
      var this2 = this;
      
      return (function*() {
        for (var k in this2.eidmap) {
          yield this2.eidmap[k];
        }
      })()
    }
    
    regen_render() {
      window.redraw_all();
    }
  };
  
  return exports;
});
