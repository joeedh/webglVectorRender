var _curve = undefined;

define([
  "util", "webgl", "vectormath", "fbo"
], function(util, webgl, vectormath, fbo) {
  'use strict';
  
  var exports = _curve = {};
  var Class = util.Class;
  var Vector2 = vectormath.Vector2;
  
  var PointFlags = exports.PointFlags = {
    SELECT : 1
  };
  
  var _mm = new util.MinMax(2);
  
  class Render {
    constructor(parent) {
      this.buffer = new webgl.RenderBuffer();
      this.regen = 1;
      this.tottris = {};
      this.parent = parent;
    }
    
    regen_buffers(gl) {
      if (this.parent.points.length < 3) {
        return; //wait for more points
      }
      
      this.regen = 0;
      
      this.minmax = new util.MinMax(2);
      
      var size = new Vector2([this.parent.width, this.parent.height]);
      
      for (var i=0; i<this.parent.points.length; i++) {
        this.minmax.minmax(this.parent.points[i]);
      }
      
      var min = new Vector2(this.minmax.min), max = new Vector2(this.minmax.max);
      var cent = new Vector2(min).add(max).mulScalar(0.5);
      
      var pad = 5.0;
      min.subScalar(pad), max.addScalar(pad);
      
      var colors1 = [], colors2 = [];
      
      var poly = [] //polygon interior triangles
      var tris = []; //exterior triangles
      var co = new Vector2();
      var parent = this.parent;
      
      function colorspush(colors) {
        for (var i=0; i<3; i++) {
          colors.push(parent.fillcolor[i]*(parent.blur!=0 ? 1.0 : 0.5));
        }
      }
      
      for (var i=0; i<this.parent.points.length; i++) {
        var p = this.parent.points[i];
        var p2 = this.parent.points[(i+1)%this.parent.points.length];
        
        co.load(p);
        
        poly.push(min[0]), poly.push(min[1]);
        poly.push(co[0]), poly.push(co[1]);
        co.load(p2), poly.push(co[0]), poly.push(co[1]);
        
        colorspush(colors1), colorspush(colors1), colorspush(colors1);
      }

      var windings = []
      
      for (var i=0; i<this.parent.points.length-1; i += 2) {
        var p1 = this.parent.points[i];
        var p2 = this.parent.points[(i+1)%this.parent.points.length];
        var p3 = this.parent.points[(i+2)%this.parent.points.length];
        
        var winding = (p1[0]-p2[0])*(p3[1]-p2[1]) - (p1[1]-p2[1])*(p3[0]-p2[0]);
        
        if (winding < 0) {
          tris.push(p3[0]), tris.push(p3[1]);
          tris.push(p2[0]), tris.push(p2[1]);
          tris.push(p1[0]), tris.push(p1[1]);
          windings.push(false);
        } else {
          tris.push(p1[0]), tris.push(p1[1]);
          tris.push(p2[0]), tris.push(p2[1]);
          tris.push(p3[0]), tris.push(p3[1]);
          windings.push(true);
        }
        
        colorspush(colors2), colorspush(colors2), colorspush(colors2);
      }
      
      var tottri = tris.length/6;
      var uvs2 = [];
      for (var i=0; i<tottri; i++) {
        if (windings[i]) {
          uvs2.push(0), uvs2.push(0);
          uvs2.push(0.5), uvs2.push(0);
          uvs2.push(1), uvs2.push(1);
        } else {
          uvs2.push(0), uvs2.push(0);
          uvs2.push(-0.5), uvs2.push(0);
          uvs2.push(-1), uvs2.push(-1);
        }
      }
      
      var uvs1 = new Float32Array(poly.length);
      this.totvert = poly.length/2;
      this.totvert_tris = tris.length / 2;
      
      var vbuf = this.vbuf = this.buffer.get(gl, "vertex")
      this.tottris["vertex"] = poly.length/2;
      this.tottris["vertex2"] = tris.length/2;
      
      gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(poly), gl.STATIC_DRAW);
      
      var vbuf2 = this.vbuf2 = this.buffer.get(gl, "vertex2")
      gl.bindBuffer(gl.ARRAY_BUFFER, vbuf2);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tris), gl.STATIC_DRAW);
      
      var ubuf1 = this.buffer.get(gl, "vertex_uv");
      gl.bindBuffer(gl.ARRAY_BUFFER, ubuf1);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs1), gl.STATIC_DRAW);
      var ubuf2 = this.buffer.get(gl, "vertex2_uv");
      gl.bindBuffer(gl.ARRAY_BUFFER, ubuf2);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs2), gl.STATIC_DRAW);
      
      var cbuf1 = this.buffer.get(gl, "vertex_color");
      gl.bindBuffer(gl.ARRAY_BUFFER, cbuf1);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors1), gl.STATIC_DRAW);
      
      var cbuf2 = this.buffer.get(gl, "vertex2_color");
      gl.bindBuffer(gl.ARRAY_BUFFER, cbuf2);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors2), gl.STATIC_DRAW);
   }
   
   destroy(gl) {
     this.buffer.destroy(gl);
     this.regen = 1;
   }
   
   compile_shader(gl) {
      var vcode = [
        "//vertex",
        "precision mediump float;",
        "attribute vec2 co;",
        "attribute vec2 uv;",
        "attribute vec3 color;",
        "",
        "uniform mat4 matrix;",
        "uniform vec2 iRes;",
        "varying vec2 vUv;",
        "varying vec3 vColor;",
        
        "void main() {",
        "  vUv = uv;",
        "  gl_Position = matrix * vec4(co, 0.0, 1.0);",
        "  vColor = color;",
        "}"
      ].join("\n");
      window.vcode = vcode;
      let fcode1 = `//fragment
#extension GL_OES_standard_derivatives : require
precision mediump float;

uniform mat4 matrix;
uniform vec2 iRes;
uniform float mul;

varying vec2 vUv;
varying vec3 vColor;

void main() {
  float u = vUv.x, v = vUv.y;
  float f = abs(v) - u*u;
  f *= sign(u);

  if (f < 0.0) {
    discard;
  }
  
  //gl_FragColor = vec4(vColor, 1.0);
  //f = f / length(vec2(dFdx(f), dFdy(f)));
  //f = min(f*0.5, 1.0);
  
  //f = fract(f);
  //gl_FragColor = vec4(f, f, f, 1.0);
  gl_FragColor = vec4(vColor, 1.0);
}
`;
      window.fcode1 = fcode1;
      
      var fcode2 = [
        "//fragment",
        "precision mediump float;",
        "",
        "uniform mat4 matrix;",
        "uniform vec2 iRes;",
        "uniform float mul;",
        "",
        "varying vec2 vUv;",
        "varying vec3 vColor;",
        "",
        "void main() {",
        "  gl_FragColor = vec4(vColor, 1.0);",
        "",
        "}"
      ].join("\n");
      
      window.fcode2 = fcode2;
      
      
      this.shader = new webgl.ShaderProgram(gl, vcode, fcode1, ["co", "uv", "color"]);
      this.shader2 = new webgl.ShaderProgram(gl, vcode, fcode2, ["co", "uv", "color"]);
   }
   
   draw(gl, matrix, buffer, shader, mul) {
      gl.clearStencil(0);
      
      if (this.parent.points.length < 3) {
        return;
      }
      
      if (this.shader === undefined) {
        this.compile_shader(gl);
      }
      
      if (this.regen) {
        if (this.shader == undefined) {
          this.shader = this.compile_shader(gl, "fragment");
          this.shader2 = this.compile_shader(gl, "fragment2");
        }
        
        this.regen_buffers(gl);
      }
      
      var vbuf = this.vbuf;
      
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer.get(gl, buffer));
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer.get(gl, buffer+"_uv"));
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
      
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer.get(gl, buffer+"_color"));
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
      
      shader = !shader ? this.shader : this.shader2;
      
      var canvas = document.getElementById("canvas");
      shader.bind(gl, {
        iRes    : [canvas.width, canvas.height],
        aspect  : canvas.height / canvas.width,
        matrix  : matrix,
        mul     : mul
      });
      
      gl.uniform1f(shader.uniformloc("T"), window.T);
      
      gl.drawArrays(gl.TRIANGLES, 0, this.tottris[buffer]);
    }
  };

  var PointFlags = exports.PointFlags = {
    SELECT : 1
  };
  
  class Point extends Vector2 {
    constructor(co) {
      super(co);
      
      this.eidmap = {};
      this.eid = -1;
      this.flag = 0;
      this.index = 0;
    }
    
    toJSON() {
      return {
        co        : [this[0], this[1]],
        flag      : this.flag,
        eid       : this.eid,
        index     : this.index
      }
    }
    
    static fromJSON(obj) {
      var ret = new Point();
      
      ret[0] = obj.co[0];
      ret[1] = obj.co[1];
      
      if (obj.fillcolor)
        ret.fillcolor = obj.fillcolor;
      
      ret.eid = obj.eid;
      ret.flag = obj.flag;
      ret.index = obj.index;
      
      return ret;
    }
    
    [Symbol.keystr]() {
      return this.eid;
    }
  }
  
  var ElementArray = exports.ElementArray = class ElementArray extends Array {
    constructor() {
      super();
      
      this.selected = new util.set();
      this.active = this.highlight = undefined;
    }
    
    setselect(p, val) {
      if (!val) {
        if (p.flag & PointFlags.SELECT)
          this.selected.remove(p);
          
        p.flag &= ~PointFlags.SELECT;
      } else {
        if (!(p.flag & PointFlags.SELECT)) 
          this.selected.add(p);
      
        p.flag |= PointFlags.SELECT;
      }
    }
  }
  
  var PathMesh = exports.PathMesh = class PathMesh {
    constructor() {
      this.eidgen = new util.IDGen();
      this.eidmap = {};
      
      this.paths = new ElementArray();
      this.points = new ElementArray();
      this.matrix = new vectormath.Matrix4();
      this.drawers = [];
      
      this.colorgen = 0;
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
      
      if (p == this.points.highlight) {
        this.points.highlight = undefined;
      }
      if (p == this.points.active) {
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
      for (var path of this.paths) {
        path.regen_render();
      }
    }

    new_fillcolor(path) {
      var t = this.colorgen * Math.PI*15.5;
      path.fillcolor[0] = Math.sin(t)*0.5 + 0.5;
      path.fillcolor[1] = Math.cos(t*2.0)*0.5 + 0.5;
      path.fillcolor[2] = Math.sin(t*3.0 + 0.3524)*0.5 + 0.5;
      this.colorgen += 1;
    }
    
    make_path() {
      var path = new QuadraticPath();
      
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
      if (path == this.paths.highlight)
        this.paths.highlight = undefined;
      if (path == this.paths.highlight)
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
    }
    
    resort() {
      console.log("resort!");
      this.drawers = [];
      if (this.paths.length == 0) 
        return;
      
      var drawer = new fbo.PathDrawer();
      //this.paths[0].blur = 40;
      drawer.blur = this.paths[0].blur;
      this.drawers.push(drawer);
      
      for (var path of this.paths) {
        if (drawer.blur != path.blur) {
          drawer = new fbo.PathDrawer();
          drawer.blur = path.blur;
          this.drawers.push(drawer);
        }
        
        drawer.paths.push(path);
      }
    }
    
    draw(gl, width, height) {
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.DITHER);
      
      var mat = this.matrix;

      mat.makeIdentity();
      mat.translate(-1.0, -1.0, 0.0);

      mat.scale(2.0 / width, 2.0 / height, 1.0);
      gl.clearStencil(0);
      
      for (var path of this.paths) {
        if (path.blur == undefined) {
          path.blur = 0;
        }
        
        if (path.blur != path._lastblur) {
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
      
      gl.clear(gl.STENCIL_BUFFER_BIT);
      
      gl.blendFuncSeparate(
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE, gl.ONE//SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA
      );

      for (var i=0; i<this.drawers.length; i++) {
      //for (var i=this.drawers.length-1; i>=0; i--) {
        gl.clear(gl.STENCIL_BUFFER_BIT);
        this.drawers[i].draw(gl, width, height, this.drawers[i].blur)
      }
      gl.enable(gl.BLEND);
    }
    
    toJSON() {
      var vs = [], ps = [];
      
      for (var i=0; i<this.points.length; i++) {
        vs.push(this.points[i]);
      }
      for (var i=0; i<this.paths.length; i++) {
        ps.push(this.paths[i]);
      }
      
      return {
        eidgen : this.eidgen,
        points : vs,
        paths  : ps,
        colorgen : this.colorgen
      }
    }
    
    static fromJSON(obj) {
      var ret = new PathMesh();
      
      ret.colorgen = obj.colorgen;
      ret.eidgen = util.IDGen.fromJSON(obj.eidgen);
      
      for (var i=0; i<obj.points.length; i++) {
        var p = Point.fromJSON(obj.points[i]);
        
        ret.eidmap[p.eid] = p;
        ret.points.push(p);
        
        if (p.flag & PointFlags.SELECT) {
          ret.points.selected.add(p);
        }
      }
      
      for (var i=0; i<obj.paths.length; i++) {
        var jpath = obj.paths[i];
        
        var path = new QuadraticPath(undefined, undefined);
        
        path.eidmap = ret.eidmap;
        path.eidgen = ret.eidgen;
        path.blur = jpath.blur;
        
        //ret.new_fillcolor(path);
        
        path.aabb[0].load(jpath.aabb[0]);
        path.aabb[1].load(jpath.aabb[1]);
        path.fillcolor = new vectormath.Vector4(jpath.fillcolor); //Float32Array(jpath.fillcolor);
        
        path.on_new_point = ret.on_new_point.bind(ret);
        path.on_kill_point = ret.on_kill_point.bind(ret);
        
        for (var j=0; j<jpath.points.length; j++) {
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
  
  //quadratic bezier path
  var QuadraticPath = exports.QuadraticPath = class QuadraticPath {
    constructor(gl, canvas) {
      this.gl = gl; //3d api
      this.canvas = canvas;
      this._lastblur = undefined;
      
      this.on_new_point = undefined;
      
      this.fillcolor = [1.0, 0.5, 0.5];
      this.blur = 0;
      
      this.matrix = new vectormath.Matrix4();
      //this.matrix.scale(1, -1, 1);
      
      this.aabb = [new Vector2(), new Vector2()];
      this.last_save = util.time_ms();

      if (canvas != undefined) {
        this.width = canvas.width, this.height = canvas.height;
      } else {
        this.width = this.height = 256;
      }
      
      this.render = new Render(this);

      this.eidgen = new util.IDGen();
      this.eidmap = {};
      
      this.points = [];
      this.points.selected = new util.set();
      
      this.points.setselect = function(p, val) {
        if (!val) {
          if (p.flag & PointFlags.SELECT)
            this.selected.remove(p);
            
          p.flag &= ~PointFlags.SELECT;
        } else {
          if (!(p.flag & PointFlags.SELECT)) 
            this.selected.add(p);
        
          p.flag |= PointFlags.SELECT;
        }
      }
    }
    
    destroy(gl) {
      this.render.destroy(gl);
    }
    
    static fromJSON(obj) {
      var ret = new QuadraticPath();
      var mm = new util.MinMax(2);
      
      ret.blur = obj.blur;      
      ret.eidgen = util.IDGen.fromJSON(obj.eidgen);

      for (var i=0; i<obj.points.length; i++) {
        ret.points.push(Point.fromJSON(obj.points[i]));
        ret.points[i].path = ret;
        
        mm.minmax(ret.points[i]);
        
        if (ret.points[i].flag & PointFlags.SELECT) {
          ret.points.selected.add(ret.points[i]);
        }
        
        ret.eidmap[ret.points[i].eid] = ret.points[i];
      }
      
      ret.aabb[0].load(mm.min);
      ret.aabb[1].load(mm.max);
      
      return ret;
    }
    
    regen_render() {
      this.render.regen = 1;
    }
    
    toJSON() {
      var a = this.aabb;
      
      return {
        eidgen  : this.eidgen,
        points : this.points,
        aabb   : [[a[0][0], a[0][1]], [a[1][0], a[1][1]]],
        fillcolor : this.fillcolor,
        blur : this.blur,
        active_point : this.points.active != undefined ? this.points.active.eid : -1
      };
    }
    
    [Symbol.keystr]() {
      return this.eid;
    }
    
    //co is optional
    make_point(co) {
      var p = new Point(co);
      
      p.eid = this.eidgen.next();
      p.path = this;
      
      this.points.push(p);
      this.eidmap[p.eid] = p;
      
      if (this.on_new_point != undefined) {
        this.on_new_point(p);
      }
      
      return p;
    }
    
    recalc_aabb() {
      var mm = _mm;
      mm.reset();
      for (var p of this.points) {
        mm.minmax(p);
      }
      
      this.aabb[0].load(mm.min);
      this.aabb[1].load(mm.max);
    }
    
    kill_point(p) {
      if (p.eid == -1) {
        console.log("point already dead", p);
        return;
      }
      
      delete this.eidmap[p.eid];
      
      if (this.points.selected.has(p)) {
        this.points.selected.remove(p);
      }
      
      if (this.points.active == p) {
        this.points.active = undefined;
      }
      if (this.points.highlight == p) {
        this.points.highlight = undefined;
      }
      
      this.points.remove(p);
      
      if (this.on_kill_point != undefined) {
        this.on_kill_point(p);
      }
      
      p.eid = -1; //flag as dead
    }
    
    clear_selection() {
      for (var i=0; i<this.points.length; i++) {
        if (this.points[i].flag & PointFlags.SELECT) {
          this.points.setselect(this.points[i], false);
        }
      }
    }
    
    //x, y in lower-left origin space
    findnearest(x, y) {
      var limit = 35;
      var mindis = 1e17, ret = undefined;
      
      limit *= limit;
      
      for (var i=0; i<this.points.length; i++) {
        var p = this.points[i];
        var dx = p[0]-x, dy = p[1]-y;
        var dis = dx*dx + dy*dy;
        
        if (dis < mindis && dis < limit) {
          ret = p;
          mindis = dis;
        }
      }
      
      return ret;
    }
    
    draw(gl, matrix, alpha, width, height) {
      this.gl = gl; //3d api
      
      if (this.path != undefined && this.path.points.length < 3) {
        return;
      }
      
      this.width = width, this.height = height;
      var w = 5;
      
      gl.enable(gl.STENCIL_TEST);

      gl.stencilFunc(gl.EQUAL, 128, 255);
      gl.stencilOp(gl.INCR, gl.KEEP, gl.KEEP);
      
      this.render.draw(gl, matrix, "vertex", 1, alpha);

      gl.stencilOp(gl.REPLACE, gl.KEEP, gl.KEEP);
      this.render.draw(gl, matrix, "vertex2", 1, alpha);

      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.stencilFunc(gl.EQUAL, 1, 1);

      this.render.draw(gl, matrix, "vertex", 1, alpha);
      
      gl.disable(gl.STENCIL_TEST);
      this.render.draw(gl, matrix, "vertex2", 0, alpha);
    }
  }
  
  return exports;
});
