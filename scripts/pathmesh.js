let _pathmesh = undefined;

define([
  "util", "vectormath", "math", "webgl", "fbo", "curve", "config"
], function(util, vectormath,
            math, webgl, fbo, curve,
            config)
{
  "use strict";

  let exports = _pathmesh = {};

  var Vector2 = vectormath.Vector2;
  let Matrix4 = vectormath.Matrix4;
  let sqrt = Math.sqrt, log = Math.log;

  let QuadraticPath = curve.QuadraticPath;
  let Render = curve.Render;
  let Point = curve.Point;
  let ElementArray = curve.ElementArray;

  var PathMesh = exports.PathMesh = class PathMesh {
    constructor() {
      this.eidgen = new util.IDGen();
      this.eidmap = {};

      this.paths = new ElementArray();
      this.points = new ElementArray();
      this.matrix = new vectormath.Matrix4();

      this.drawers = [];
      this.renders = [];

      this.colorgen = 0;
      this.rehash = 1;
    }

    sync_selection() {
      for (var path of this.paths) {
        path.points.selected.reset();

        for (var p of path.points) {
          if (p.flag & PointFlags.SELECT) {
            path.points.selected.add(p);
          }
        }
      }
    }

    on_new_point(p) {
      this.points.push(p);
    }

    on_kill_point(p) {
      if (this.points.selected.has(p)) {
        this.points.selected.remove(p);
      }

      delete this.eidmap[p.eid];
      this.points.remove(p);

      if (p === this.points.highlight) {
        this.points.highlight = undefined;
      }
      if (p === this.points.active) {
        this.points.active = undefined;
      }
    }

    recalc_aabb() {
      for (var path of this.paths) {
        path.recalc_aabb();
      }
    }

    clear_selection() {
      this.points.selected.reset();

      for (var p of this.points) {
        p.flag &= ~PointFlags.SELECT;
      }

      this.sync_selection();
    }

    regen_render() {
      this.rehash = 1;

      for (let r of this.renders) {
        //r.reset(this.gl);
        r.regen = 1;
      }

      for (var path of this.paths) {
        path.regen_render();
      }
    }

    new_fillcolor(path) {
      var t = this.colorgen * Math.PI * 15.5;
      path.fillcolor[0] = Math.sin(t) * 0.5 + 0.5;
      path.fillcolor[1] = Math.cos(t * 2.0) * 0.5 + 0.5;
      path.fillcolor[2] = Math.sin(t * 3.0 + 0.3524) * 0.5 + 0.5;
      this.colorgen += 1;
    }

    make_path() {
      this.rehash = 1;

      if (this.renders.length === 0) {
        let render = new Render();
        this.renders.push(render);
      }

      let render = this.renders[this.renders.length - 1];

      var path = new QuadraticPath(undefined, undefined, render, this);

      path.index = this.paths.length;
      path.eidgen = this.eidgen;
      path.eid = this.eidgen.next();

      this.eidmap[path.eid] = path;
      this.paths.push(path);

      this.new_fillcolor(path);

      path.on_new_point = this.on_new_point.bind(this);
      path.on_kill_point = this.on_kill_point.bind(this);

      return path;
    }

    kill_path(path) {
      if (path === this.paths.highlight)
        this.paths.highlight = undefined;
      if (path === this.paths.highlight)
        this.paths.highlight = undefined;
      if (this.paths.selected.has(path)) {
        this.paths.selected.remove(path);
      }

      delete this.eidmap[path.eid];
      this.paths.remove(path);
    }

    destroy(gl) {
      for (let path of this.paths) {
        path.destroy(gl);
      }

      for (let d of this.drawers) {
        d.destroy(gl);
      }

      for (let r of this.renders) {
        r.destroy(gl);
      }
    }

    reset(gl) {
      this.colorgen = 0;
      this.destroy(gl);

      for (let r of this.renders) {
        r.reset(gl);
      }

      this.paths.length = new ElementArray();
      this.points = new ElementArray();
      this.eidmap = {};
      this.drawers = [];
    }

    resort() {
      console.log("resort!");
      for (let d of this.drawers) {
        d.destroy(this.gl);
      }

      this.drawers = [];
      if (this.paths.length === 0)
        return;

      var drawer = new fbo.PathDrawer();
      //this.paths[0].blur = 40;
      drawer.blur = this.paths[0].blur;
      this.drawers.push(drawer);
      let rvisit = new Set();

      for (var path of this.paths) {
        if (drawer.blur !== path.blur) {
          drawer = new fbo.PathDrawer();
          drawer.blur = path.blur;
          rvisit = new Set();
          this.drawers.push(drawer);
        }

        drawer.paths.push(path);
        if (!rvisit.has(path.render)) {
          rvisit.add(path.render);
          drawer.renders.push(path.render);
        }

        path.calcHash();
      }

      let totpoint = 0;
      for (let r of this.renders) {
        totpoint += r.points.length;
      }

      console.log("total vertices:", totpoint);
    }

    draw(gl, width, height) {
      this.gl = gl;

      if (this.rehash) {
        console.warn("Rehash!", this.paths.length);
        this.rehash = 0;

        for (let path of this.paths) {
          path.calcHash();
        }
      }

      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.DITHER);

      var mat = this.matrix;

      mat.makeIdentity();
      mat.translate(-1.0, -1.0, 0.0);

      mat.scale(2.0 / width, 2.0 / height, 1.0);
      if (STENCILMODE) gl.clearStencil(0);

      for (var path of this.paths) {
        if (path.blur === undefined) {
          path.blur = 0;
        }

        if (path.blur !== path._lastblur) {
          this.resort();
          break;
        }
      }

      for (var path of this.paths) {
        path._lastblur = path.blur;
      }

      /*
      if (this.drawers.length == 0) {
        this.drawers.push(new fbo.PathDrawer());
      }

      var drawer = this.drawers[0];
      for (var path of this.paths) {
        var drawer;

        if (path.drawer != undefined && path.drawer.blur != path.blur) {
          path.drawer.paths.remove(path);
          path.drawer = undefined;
        }

        for (var j=0; j<this.drawers.length; j++) {
          drawer = this.drawers[j];

          if (drawer.blur == path.blur) {
            break;
          }
        }

        if (j == this.drawers.length) {
          drawer = new fbo.PathDrawer();
          drawer.blur = path.blur;
          this.drawers.push(drawer);
        }

        if (drawer.paths.indexOf(path) < 0) {
          drawer.paths.push(path);
          path.drawer = drawer;
        }
      }*/

      if (STENCILMODE) gl.clear(gl.STENCIL_BUFFER_BIT);


      for (var i = 0; i < this.drawers.length; i++) {
        //for (var i=this.drawers.length-1; i>=0; i--) {
        if (STENCILMODE) gl.clear(gl.STENCIL_BUFFER_BIT);
        this.drawers[i].draw(gl, width, height, this.drawers[i].blur)
      }

      for (let r of this.renders) {
        if (r.texFbo && config.DRAW_MASK_BUFFERS) {
          r.texFbo.draw(gl, 0.05, 0.05, 500, 500);
        }
      }
      gl.enable(gl.BLEND);

      fbo.flushFBOPool(gl);
    }

    toJSON() {
      var vs = [], ps = [];

      for (var i = 0; i < this.points.length; i++) {
        vs.push(this.points[i]);
      }
      for (var i = 0; i < this.paths.length; i++) {
        ps.push(this.paths[i]);
      }

      return {
        eidgen: this.eidgen,
        points: vs,
        paths: ps,
        colorgen: this.colorgen
      }
    }

    static fromJSON(obj) {
      var ret = new PathMesh();

      ret.colorgen = obj.colorgen;
      ret.eidgen = util.IDGen.fromJSON(obj.eidgen);

      for (var i = 0; i < obj.points.length; i++) {
        var p = Point.fromJSON(obj.points[i]);

        ret.eidmap[p.eid] = p;
        ret.points.push(p);

        if (p.flag & PointFlags.SELECT) {
          ret.points.selected.add(p);
        }
      }

      let render = new Render();
      ret.renders.push(render);

      for (var i = 0; i < obj.paths.length; i++) {
        var jpath = obj.paths[i];

        var path = new QuadraticPath(undefined, undefined, render);

        path.eidmap = ret.eidmap;
        path.eidgen = ret.eidgen;
        path.blur = jpath.blur;

        //ret.new_fillcolor(path);

        path.aabb[0].load(jpath.aabb[0]);
        path.aabb[1].load(jpath.aabb[1]);
        path.fillcolor = new vectormath.Vector4(jpath.fillcolor); //Float32Array(jpath.fillcolor);

        path.on_new_point = ret.on_new_point.bind(ret);
        path.on_kill_point = ret.on_kill_point.bind(ret);

        for (var j = 0; j < jpath.points.length; j++) {
          var p = ret.eidmap[jpath.points[j].eid];

          path.points.push(p);
          p.path = path;

          if (p.flag & PointFlags.SELECT) {
            path.points.selected.add(p);
          }

          if (p.eid == jpath.active_point) {
            path.points.active = p;
          }
        }

        ret.eidmap[path.eid] = path;
        ret.paths.push(path);

        path.recalc_aabb();
      }

      return ret;
    }
  }

  return exports;
});
