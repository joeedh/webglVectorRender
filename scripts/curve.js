var _curve = undefined;

define([
  "util", "webgl", "vectormath", "fbo", "simplemesh", "boxpack", "config"
], function (util, webgl, vectormath,
              fbo, simplemesh, boxpack, config) {
  'use strict';

  var exports = _curve = {};
  var Class = util.Class;
  var Vector2 = vectormath.Vector2;
  let Matrix4 = vectormath.Matrix4;

  window.STENCILMODE = false;

  let sqrt = Math.sqrt, log = Math.log;

  function quad(k1, k2, k3, s) {

  }

  let safesqrt = (f) => {
    //console.log(f);
    return sqrt(f);
  }
  let safelog = (f) => {
    //console.log(f);
    if (f <= 0.0) {
      return log(Math.abs(f));
    }
    return log(f);
  }

  function quad_arc_length(x1, y1, x2, y2, x3, y3) {
    x2 -= x1;
    y2 -= y1;

    x3 -= x1;
    y3 -= y1;

    //let sqrt = safesqrt;
    let log = safelog;

    let arc = (sqrt(-2 * (2 * x2 - x3) * x2 + 4 * (x2 - x3) * x2 - (2 * y2 - y3) * y3 + x2 ** 2 + x3 ** 2
      + y2 ** 2) * ((2 * y2 - y3) ** 2 + x3 ** 2 + 4 * (x2 - x3) * x2) * ((2 * y2 - y3) * (y2 - y3) +
      x3 ** 2 + (2 * x2 - 3 * x3) * x2) + sqrt(4 * (x2 - x3) * x2 + (2 * y2 - y3) ** 2 + x3 ** 2) * (
      x2 * y3 - x3 * y2) ** 2 * log((sqrt(4 * (x2 - x3) * x2 + (2 * y2 - y3) ** 2 + x3 ** 2) *
      sqrt(-2 * (2 * x2 - x3) * x2 + 4 * (x2 - x3) * x2 - (2 * y2 - y3) * y3 + x2 ** 2 + x3 ** 2 + y2
        ** 2) + x3 ** 2 + (2 * y2 - y3) * (y2 - y3) + 4 * (x2 - x3) * x2 - (2 * x2 - x3) * x2) / (x2 * y3
      - x3 * y2)) + sqrt(x2 ** 2 + y2 ** 2) * ((2 * y2 - y3) ** 2 + x3 ** 2 + 4 * (x2 - x3) * x2) * (
      (2 * x2 - x3) * x2 + (2 * y2 - y3) * y2) - sqrt(4 * (x2 - x3) * x2 + (2 * y2 - y3) ** 2 + x3 **
      2) * (x2 * y3 - x3 * y2) ** 2 * log((-((2 * y2 - y3) * y2 - sqrt(4 * (x2 - x3) * x2 + (2 *
      y2 - y3) ** 2 + x3 ** 2) * sqrt(x2 ** 2 + y2 ** 2) + (2 * x2 - x3) * x2)) / (x2 * y3 - x3 * y2
    ))) / (4 * x2 ** 2 - 4 * x2 * x3 + x3 ** 2 + 4 * y2 ** 2 - 4 * y2 * y3 + y3 ** 2) ** 2;

    if (isNaN(arc)) {
      //console.warn("NaN!", x2, y2, x3, y3);
      arc = 0.00001;
      let steps = 1024;
      let s = 0.0, ds = 1.0 / steps, sum = 0.0;

      for (let i = 0; i < steps; i++, s += ds) {
        let dx = -2 * ((2 * s - 1) * x2 - x3 * s);
        let dy = -2 * ((2 * s - 1) * y2 - y3 * s);

        sum += Math.sqrt(dx * dx + dy * dy) * ds;
      }

      if (!isNaN(sum)) {
        arc = sum;
      }

      arc = Math.max(arc, 0.00001);
      //console.log((sum - arc).toFixed(3), sum.toFixed(3), arc.toFixed(3));

    }
    //*/

    return arc;

  }

  var PointFlags = exports.PointFlags = {
    SELECT: 1
  };

  var _mm = new util.MinMax(2);

  let shaders = exports.shaders = {};

  class Render {
    constructor() {
      this.buffer = new webgl.RenderBuffer();
      this.regen = 1;
      this.tottris = {};
      this.points = [];
      this.width = 200;
      this.height = 200;
      this.stencili = 0;
      this.fillColor = [1, 0.5, 0.25, 1.0];

      if (!STENCILMODE) {
        this.fan = undefined;
      }
    }

    reset(gl) {
      this.buffer.destroy(gl);
      this.points.length = 0;
    }

    addPoint(p) {
      this.points.push(p);
    }

    genNonStencil(gl, genMaskMode=false) {
      let uvs1 = [];
      let uvs2 = [];
      let verts1 = [];
      let colors1 = [];
      let tex = [];
      let texh = 32;

      let paths = new Set();
      for (let p of this.points) {
        paths.add(p.path);
      }

      for (let path of paths) {
        path.recalc_aabb();

        let min = path.aabb[0], max = path.aabb[1];
        let start = tex.length / 4;

        //quad_arc_length
        let arc;
        for (let i = 0; i < path.points.length; i++) {
          let p = path.points[i];

          if (i % 2 === 0) {
            let p1 = p;
            let p2 = path.points[(i + 1) % path.points.length];
            let p3 = path.points[(i + 2) % path.points.length];

            arc = quad_arc_length(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
          }

          tex.push(p[0]);
          tex.push(p[1]);
          tex.push(arc);
          tex.push(0.0);
        }

        //close path
        let ps = path.points;

        //*
        tex.push(ps[ps.length - 2][0]);
        tex.push(ps[ps.length - 2][1]);
        tex.push(arc);
        tex.push(0.0);

        //tex.push((ps[ps.length-1][0] - ps[ps.length-2][0]) + ps[0][0]);
        //tex.push((ps[ps.length-1][1] - ps[ps.length-2][1]) + ps[0][1]);
        tex.push(ps[ps.length - 1][0]);
        tex.push(ps[ps.length - 1][1]);
        tex.push(arc);
        tex.push(0.0);

        tex.push(ps[0][0]);
        tex.push(ps[0][1]);
        tex.push(arc);
        tex.push(0.0);
        //*/

        let end = tex.length / 4 - 2;

        verts1.push(min[0]);
        verts1.push(min[1]);
        verts1.push(min[0]);
        verts1.push(max[1]);
        verts1.push(max[0]);
        verts1.push(max[1]);

        verts1.push(min[0]);
        verts1.push(min[1]);
        verts1.push(max[0]);
        verts1.push(max[1]);
        verts1.push(max[0]);
        verts1.push(min[1]);

        let color = path.fillcolor;

        for (let i = 0; i < 3 * 6; i++) {
          colors1.push(color[i % 3]);
        }

        let z = 1.0 - path.index / path.pmesh.paths.length;
        z = z * 0.98 + 0.01;

        if (path.uvstart) {
          let s = path.uvstart, e = path.uvend;

          uvs2.push(s[0]); uvs2.push(s[1]);
          uvs2.push(s[0]); uvs2.push(e[1]);
          uvs2.push(e[0]); uvs2.push(e[1]);

          uvs2.push(s[0]); uvs2.push(s[1]);
          uvs2.push(e[0]); uvs2.push(e[1]);
          uvs2.push(e[0]); uvs2.push(s[1]);
        } else {
          for (let i=0; i<6; i++) {
            uvs2.push(0.0);
          }
        }

        uvs1.push(z);
        uvs1.push(0);
        uvs1.push(start);
        uvs1.push(end);

        uvs1.push(z);
        uvs1.push(1);
        uvs1.push(start);
        uvs1.push(end);
        uvs1.push(z);
        uvs1.push(1);
        uvs1.push(start);
        uvs1.push(end);

        uvs1.push(z);
        uvs1.push(0);
        uvs1.push(start);
        uvs1.push(end);
        uvs1.push(z);
        uvs1.push(1);
        uvs1.push(start);
        uvs1.push(end);
        uvs1.push(z);
        uvs1.push(0);
        uvs1.push(start);
        uvs1.push(end);

        path.startfi = start;
        path.endfi = end;
      }

      let l = Math.pow(2, Math.ceil(Math.log(tex.length / 4) / Math.log(2.0)));

      if (l > 64) {
        texh = 32;
      } else if (l > 32) {
        texh = 16;
      } else if (l > 16) {
        texh = 8;
      } else {
        texh = 1;
      }

      while (tex.length / 4 < l) {
        tex.push(0);
      }

      console.log("tex size", l / texh, texh);
      let texw = l / texh;

      tex = new Float32Array(tex);
      let gltex = this.gltex = gl.createTexture();
      this.gltex = new webgl.Texture(this.gltex);

      this.texw = texw;
      this.texh = texh;

      console.log("totvert", verts1.length / 2);
      this.tottris["vertex"] = verts1.length / 2;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, gltex);

      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texw, texh, 0, gl.RGBA, gl.FLOAT, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      var vbuf = this.vbuf = this.buffer.get(gl, "vertex")
      gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts1), gl.STATIC_DRAW);

      var vbuf2 = this.vbuf2 = this.buffer.get(gl, "vertex_co")
      gl.bindBuffer(gl.ARRAY_BUFFER, vbuf2);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts1), gl.STATIC_DRAW);

      var ubuf1 = this.buffer.get(gl, "vertex_uv");
      gl.bindBuffer(gl.ARRAY_BUFFER, ubuf1);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs1), gl.STATIC_DRAW);

      var ubuf2 = this.buffer.get(gl, "vertex_uv2");
      gl.bindBuffer(gl.ARRAY_BUFFER, ubuf2);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs2), gl.STATIC_DRAW);

      var cbuf1 = this.buffer.get(gl, "vertex_color");
      gl.bindBuffer(gl.ARRAY_BUFFER, cbuf1);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors1), gl.STATIC_DRAW);

    }

    regen_buffers(gl) {
      this.genNonStencil(gl);
      this.genTex(gl);
      this.genNonStencil(gl);
    }

    genTex(gl) {
      let paths = new Set();
      for (let p of this.points) {
        paths.add(p.path);
      }

      let packer = new boxpack.BoxPacker();
      let boxes = packer.boxes;

      for (let path of paths) {
        path.recalc_aabb();

        let box = new boxpack.Box();

        box.path = path;
        box.pos.zero(); //load(path.aabb[0]);
        box.pos[0] = Math.random()*32;
        box.pos[1] = Math.random()*32;
        box.size.load(path.aabb[1]).sub(path.aabb[0]);

        let dimen = Math.max(box.size[0], box.size[1]);
        let scale = 1.0;

        if (dimen > 400) {
          scale = 0.05;
        } else if (dimen > 256) {
          scale = 0.1;
        } if (dimen > 128) {
          scale = 0.2;
        } else if (dimen > 64) {
          scale = 0.3;
        } else if (dimen > 32) {
          scale = 0.4;
        } else if (dimen > 16) {
          scale = 0.5;
        }

        let s2 = 128 / dimen;
        //scale = Math.min(scale, s2);
        //scale = 1.0;

        box.size.mulScalar(scale);

        packer.add(box);
      }

      packer.pack();

      let size = packer.size;
      size[0] = Math.max(size[0], 16);
      size[1] = Math.max(size[1], 16);

      let oldf = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      let fbuf = new fbo.FBO(size[0], size[1]);

      let verts1 = [];
      let verts2 = [];
      let uvs1 = [];
      let colors1 = [];
      let color = [1, 1, 1, 1];
      let pos = new Vector2(), bsize = new Vector2();

      for (let box of boxes) {
        let path = box.path;

        //box.pos.load(path.aabb[0]);
        //box.size.load(path.aabb[1]).sub(path.aabb[0]);

        for (let i=0; i<6*3; i++) {
          colors1.push(color[i%4]);
        }

        for (let i=0; i<2; i++) {
          let verts = i ? verts2 : verts1;

          if (i) {
            pos.load(path.aabb[0]);
            bsize.load(path.aabb[1]).sub(path.aabb[0]);
          } else {
            pos.load(box.pos);
            bsize.load(box.size);
          }

          verts.push(pos[0]);
          verts.push(pos[1]);
          verts.push(pos[0]);
          verts.push(pos[1] + bsize[1]);
          verts.push(pos[0] + bsize[0]);
          verts.push(pos[1] + bsize[1]);

          verts.push(pos[0]);
          verts.push(pos[1]);
          verts.push(pos[0] + bsize[0]);
          verts.push(pos[1] + bsize[1]);
          verts.push(pos[0] + bsize[0]);
          verts.push(pos[1]);
        }
        let start = path.startfi, end = path.endfi;
        let z = 0.5;

        uvs1.push(z);
        uvs1.push(0);
        uvs1.push(start);
        uvs1.push(end);
        uvs1.push(z);
        uvs1.push(1);
        uvs1.push(start);
        uvs1.push(end);
        uvs1.push(z);
        uvs1.push(1);
        uvs1.push(start);
        uvs1.push(end);

        uvs1.push(z);
        uvs1.push(0);
        uvs1.push(start);
        uvs1.push(end);
        uvs1.push(z);
        uvs1.push(1);
        uvs1.push(start);
        uvs1.push(end);
        uvs1.push(z);
        uvs1.push(0);
        uvs1.push(start);
        uvs1.push(end);

        //*
        box.pos.div(packer.size);
        box.size.div(packer.size);

        path.uvstart = new Vector2(box.pos);
        path.uvend = new Vector2(box.pos).add(box.size);
        //*/
      }

      console.log("TOTVERT", verts1.length / 2);
      this.tottris["vertex"] = verts1.length / 2;

      let uvs2 = [];
      for (let i=0; i<verts1.length; i++) {
        uvs2.push(0.0);
      }
      uvs2 = new Float32Array(uvs2);

      this.buffer.destroy(gl);
      var vbuf = this.vbuf = this.buffer.get(gl, "vertex")
      gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts1), gl.STATIC_DRAW);

      var vbuf2 = this.vbuf2 = this.buffer.get(gl, "vertex_co")
      gl.bindBuffer(gl.ARRAY_BUFFER, vbuf2);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts2), gl.STATIC_DRAW);

      var ubuf1 = this.buffer.get(gl, "vertex_uv");
      gl.bindBuffer(gl.ARRAY_BUFFER, ubuf1);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs1), gl.STATIC_DRAW);

      var ubuf2 = this.buffer.get(gl, "vertex_uv2");
      gl.bindBuffer(gl.ARRAY_BUFFER, ubuf2);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs2), gl.STATIC_DRAW);

      var cbuf1 = this.buffer.get(gl, "vertex_color");
      gl.bindBuffer(gl.ARRAY_BUFFER, cbuf1);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors1), gl.STATIC_DRAW);

      let matrix = new Matrix4();

      //this.genNonStencil(gl, true);

      console.warn(oldf);

      fbuf.gen_buffers(gl);
      fbuf.bind(gl);

      gl.viewport(0, 0, fbuf.size[0], fbuf.size[1]);
      matrix.translate(-1, -1, 0)
      matrix.scale(2.0/fbuf.size[0], 2.0/fbuf.size[1], 1.0);

      gl.disable(gl.BLEND);
      gl.disable(gl.DITHER);
      gl.disable(gl.DEPTH_TEST);

      gl.clearColor(0, 1, 0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      this.compile_shader(gl, ["WRITEFI"]);
      this.draw2(gl, matrix, "vertex", 1, 1.0);
      this.compile_shader(gl, ["USE_MASK"]);

      gl.flush();
      gl.enable(gl.DITHER);

      fbuf.unbind(gl);
      gl.bindFramebuffer(gl.FRAMEBUFFER, oldf);

      if (this.texFbo) {
        this.texFbo.destroy(gl);
      }

      this.texFbo = fbuf;
    }

    destroy(gl) {
      this.buffer.destroy(gl);
      this.regen = 1;
    }

    compile_shader(gl, defines=[]) {
      let vcode, fcode;

      vcode = `
      //vertex,
      precision highp float;

      attribute vec2 co;
      attribute vec4 uv;
      attribute vec3 color;
      attribute vec2 localCo;
      attribute vec2 uv2;
      
      uniform mat4 matrix;
      uniform vec2 iRes;
      varying vec4 vUv;
      varying vec3 vColor;
      varying vec2 vCo;
      varying vec2 vMaskUV;
      
      void main() {
        vUv = uv;
        float z = uv[0];
        
        vCo = localCo; //(matrix * vec4(co, 0.0, 1.0)).xy;
        
        vec4 p = matrix * vec4(co, z, 1.0);
        p[2] = z;
        gl_Position = p;
        vColor = color;
        vMaskUV = uv2;
      }
      `;

      window.vcode = vcode;

      fcode = `
      //fragment
      precision highp float;
      
      //DEFINES
      
      uniform mat4 matrix;
      uniform vec2 iRes;
      uniform float mul;
      uniform float texw, texh;
      uniform sampler2D tex;
      uniform sampler2D mask;
      uniform float T;
      
      varying vec2 vCo;
      varying vec4 vUv;
      varying vec3 vColor;
      varying vec2 vMaskUV;
      
      float quad(float k1, float k2, float k3, float s) {
        return -((k1-k2+(k2-k3)*s-(k1-k2)*s)*s+(k1-k2)*s-k1);
      }
      float dquad(float k1, float k2, float k3, float s) {
        return 2.0*(k1*s-k1-2.0*k2*s+k2+k3*s);
      }
      float d2quad(float k1, float k2, float k3, float s) {
        return 2.0*(k1-k2-(k2-k3));
      }
      
      vec2 quad2(vec2 a, vec2 b, vec2 c, float s) {
        return vec2(
          quad(a[0], b[0], c[0], s),
          quad(a[1], b[1], c[1], s)
          );
      }

      vec2 dquad2(vec2 a, vec2 b, vec2 c, float s) {
        return vec2(
          dquad(a[0], b[0], c[0], s),
          dquad(a[1], b[1], c[1], s)
          );
      }
      
      vec2 d2quad2(vec2 a, vec2 b, vec2 c, float s) {
        return vec2(
          d2quad(a[0], b[0], c[0], s),
          d2quad(a[1], b[1], c[1], s)
          );
      }
      
      vec2 getuv(vec2 p, vec2 a, vec2 b, vec2 c) {
        float x = p[0], y = p[1];
        float ax = a[0], ay = a[1];
        float bx = b[0], by = b[1];
        float cx = c[0], cy = c[1];
        
        float u = (cx*y-cy*x+(cy-y)*bx-(cx-x)*by)/(bx*cy-by*cx+(by-cy)*ax-(bx-cx)*ay);
        float v = (-(cx*y-cy*x+(cy-y)*ax-(cx-x)*ay))/(bx*cy-by*cx+(by-cy)*ax-(bx-cx)*ay);
        return vec2(u, v);
      }
      
      vec2 getp(float fd, out float arclength) {
        float fu = floor(mod(fd+0.00001, texw)+0.000001)/texw;
        float fv = floor(fd / texw + 0.001) / texh;
        
        vec4 p = texture2D(tex, vec2(fu, fv));
        arclength = p[2];
        return p.xy;
      }
      
      /*
      on factor;
      off period;
      
      fx := ax*u + bx*v + cx*(1.0-u-v);
      fy := ay*u + by*v + cy*(1.0-u-v);
      
      f1 := fx - x;
      f2 := fy - y;
      
      ff := solve({f1, f2}, {u, v});
      fu := part(ff, 1, 1, 2);
      fv := part(ff, 1, 2, 2);
      
      on fort;
      fu;
      fv;
      off fort;
      
      */
      
      float safesign(float f) {
        return f == 0.0 ? 1.0 : sign(f);
      }
      
      float winding(vec2 a, vec2 b, vec2 c) {
        vec2 dv1 = a - b;
        vec2 dv2 = c - b;
        
        return safesign(dv1[0]*dv2[1] - dv1[1]*dv2[0]);
      }
      
      float insidetri(vec2 a, vec2 b, vec2 c, vec2 co) {
        float w1 = winding(a, co, b);
        float w2 = winding(b, co, c);
        float w3 = winding(c, co, a);
        
        return float(w1 == w2 && w2 == w3);
      }
      
      //from http://hhoppe.com/ravg.pdf
      // random access rendering of general vector graphics
      
      float det(vec2 a, vec2 b) { return a.x*b.y - b.x*a.y; }
      vec2 lerp(vec2 a, vec2 b, float t) {
        return a + (b - a)*t;
      }
      
      bool colinear(vec2 a, vec2 b, vec2 c) {
        vec2 v1 = a - b;
        vec2 v2 = c - b;
        
        v1 = normalize(v1);
        v2 = normalize(v2);
        
        return abs(dot(v1, v2)) > 0.999; 
      }
      
      // Find vector 𝑣𝑖 given pixel 𝑝=(0,0) and Bézier points 𝑏0,𝑏1,𝑏2.
      float get_distance_t(vec2 b0, vec2 b1, vec2 b2) {
        if (colinear(b0, b1, b2)) {
          vec2 v1 = b2 - b0;
          
          v1 = normalize(v1);
          
          return dot(-b0, v1) / length(b2 - b0);
        }
        
        float a = det(b0,b2), b = 2.0*det(b1,b0), d = 2.0*det(b2,b1);
        float f = b*d - a*a;
        vec2 d21 = b2-b1, d10=b1-b0, d20=b2-b0;
        vec2 gf = 2.0*(b*d21+d*d10+a*d20);
        
        gf=vec2(gf.y, -gf.x);
        
        vec2 pp = -f*gf/max(dot(gf,gf), 0.00001); 
        vec2 d0p = b0-pp;
        float ap = det(d0p,d20), bp=2.0*det(d10,d0p);
        
        // (note that 2.0*ap+bp+dp = 2.0*a+b+d = 4.0*area(b0,b1,b2))
        float t = (ap+bp)/(2.0*a + b + d);
        //t = clamp(t, 0.0, 1.0);
        
        return t;
        //return lerp(lerp(b0,b1,t),lerp(b1,b2,t),t);
      }
      
      void main() {
        //gl_FragColor = vec4(vColor, 1.0);
        float f = vUv[0]*0.0;
        
        float totpoint = vUv[3] - vUv[2];
        float fi = 0.0;
        float x = gl_FragCoord[0];
        
        float dis = 100000.0;
        float dis3 = 100000.0, dis4 = 10000.0;
        float disb;
        float w = 0.0;
        float tot = 0.0;
        float sdis = 0.0;
        float minfi = 1.0;
        float minfi2 = -1.0;
        float minfi3 = -1.0;
#ifndef USE_MASK
        for (int i=0; i<500; i++) {
          float fd = vUv[2] + fi;

          float arc, arc2;
          
          vec2 p1 = getp(fd, arc);
          vec2 p2 = getp(fd+1.0, arc);
          vec2 p3 = getp(fd+2.0, arc2);
          float dis2; 
          
          float scale = 1.0 / (arc == 0.0 ? 1.0 : arc);
          //scale = 1.0;
          //scale = 0.0000001;
          
          float x2 = (p2[0] - p1[0])*scale;
          float y2 = (p2[1] - p1[1])*scale;
          float x3 = (p3[0] - p1[0])*scale;
          float y3 = (p3[1] - p1[1])*scale;
          float x32 = x3*x3;
          float dis2b = 0.0;
          
          float x = (vCo[0] - p1[0])*scale;
          float y = (vCo[1] - p1[1])*scale;
          float s = 1.0;

          float sign1 = 1.0;
          
          s = get_distance_t((p1-vCo)*scale, (p2-vCo)*scale, (p3-vCo)*scale);
          s = min(max(s, 0.0), 1.0);
          
          vec2 p4 = quad2(p1, p2, p3, s) - vCo;
          
          dis2b = length(p4);
          
          float inside = insidetri(p1, vec2(1000.0, 1000.0), p3, vCo);
          float inside2 = insidetri(p1, p2, p3, vCo);
          
          float adis2b = abs(dis2b);
          float adis = abs(dis);
          
          if (adis2b < adis) {
            dis = dis2b*sign1;
            sdis = s;
            minfi = fi;
          } else if (adis2b < abs(dis3)) {
            minfi2 = fi;
            dis3 = adis2b*sign1;
          } else if (adis2b < abs(dis4)) {
            minfi3 = fi;
            dis4 = adis2b*sign1;
          }
          
          if (inside2 > 0.0) {
            vec2 uv = getuv(vCo, p1, p2, p3);
            
            /*
            float u = uv[0]*0.0 + uv[1]*0.5 + (1.0-uv[0]-uv[1])*1.0;
            float v = (1.0-uv[0]-uv[1])*1.0;
            
            dis2b = (v - u*u);
            float sign3 = safesign(dis2b);
            
            dis2b = abs(dis2b);
            
            //dis2b = sqrt(dis2b);
            
            dis2b *= (length(p1-p2)+length(p2-p3))*0.5;
            
            dis2b *= sign3;
            //dis = dis2b;
            sign1 = safesign(dis2b);
            */
            
            
            vec2 bdv = dquad2(p1, p2, p3, s);
            sign1 = safesign(bdv[0]*p4[1] - bdv[1]*p4[0]);
            
            if (winding(p1, vCo, p3) < 0.0) {
              sign1 = -sign1;
            }
            inside2 = float((sign1 > 0.0) && (inside2 > 0.0));
          } else {
            sign1 = -winding(p1, vCo, p3);
          }
          
          w += inside+inside2;
          
          //w += float(sign1 >= 0.0);
          //w += sign1;
          
          tot += 1.0;
          
          fi += 2.0;
          if (fi+0.00001 >= totpoint) {
            break;
          }
        }
#endif

#ifdef USE_MASK
      vec4 p = texture2D(mask, vMaskUV);
      float arc, arc2;
      dis = 100000.0;
      
      for (int i=0; i<3; i++) {
        float fd = p[i] + vUv[2];
        
        vec2 p1 = getp(fd, arc);
        vec2 p2 = getp(fd+1.0, arc);
        vec2 p3 = getp(fd+2.0, arc2);
        
        float sign1 = 1.0;
        
        float s = get_distance_t((p1-vCo), (p2-vCo), (p3-vCo));
        s = min(max(s, 0.0), 1.0);
        
        vec2 p4 = quad2(p1, p2, p3, s) - vCo;
        
        float dis2b = length(p4);
        float sign2 = safesign(p[3]+8.0);
       
        
        //float inside = insidetri(p1, vec2(1000.0, 1000.0), p3, vCo);
        float inside2 = insidetri(p1, p2, p3, vCo);
        
        if (p[3] < 9.0) {//inside2 != 0.0) {
          vec2 bdv = dquad2(p1, p2, p3, s);
          sign1 = safesign(bdv[0]*p4[1] - bdv[1]*p4[0]);
          
          if (winding(p1, vCo, p3) < 0.0) {
          //  sign1 = -sign1;
          }
          //inside2 = float((sign1 > 0.0) && (inside2 > 0.0));
          
          if (sign1 < 0.0) {
            sign2 = -1.0;
          }
        }
        
        dis2b *= sign2;
        if (abs(dis2b) < abs(dis)) {
          dis = dis2b;
        }
      }
      
      if (dis < 0.0) {
        discard;
      }

      w = 1.0;
      
      //p[0] = fract(p[0]*3.85+0.32);
      ///p[1] = fract(p[1]*3.15);
      //p[2] = fract(p[2]*3.25);
      //p[0] /= (vUv[3] - vUv[2]) * 2.0;
     // p[1] /= (vUv[3] - vUv[2]) * 2.0;
      //p[2] /= (vUv[3] - vUv[2]) * 2.0;
      
      gl_FragColor = vec4(vColor, 1.0);
#endif

        dis = abs(dis);
        
        if (mod(w, 2.0) == 0.0) {
          dis = -dis;
        } else {
#ifndef WRITEFI
          dis = abs(dis);
#endif
        }
        
        //dis += 0.5;
#ifndef WRITEFI
        if (dis < 0.0) {
          discard;
        }
        //dis *= 0.01;
        float dis2 = dis*0.01;
        sdis = fract(sdis*8.0);
        
        dis = max(min(dis/1.0, 1.0), 0.0);
#endif
        
//#define WRITEFI
#ifdef WRITEFI
        /*
        minfi = (minfi - vUv[2]) / (vUv[3] - vUv[2]) / 2.0;
        minfi2 = (minfi2 - vUv[2]) / (vUv[3] - vUv[2]) / 2.0;
        minfi3 = (minfi3 - vUv[2]) / (vUv[3] - vUv[2]) / 2.0;
        //*/
        
        gl_FragColor = vec4(minfi, minfi2, minfi3, dis);
#else
#ifndef USE_MASK
        gl_FragColor = vec4(vColor, dis);
#endif
#endif
      }        
      `;

      let defbuf = "";
      for (let def of defines) {
        defbuf += "#define " + def + "\n";
      }

      fcode = fcode.replace(/\/\/DEFINES/, defbuf);

      if (fcode in shaders) {
        this.shader = shaders[fcode].shader;
        return;
      }

      this.shader = new webgl.ShaderProgram(gl, vcode, fcode, ["co", "uv", "color", "co2", "uv2"]);

      shaders[fcode] = {
        shader  : this.shader
      }
    }

    draw(gl, matrix, alpha, width, height) {
      this.gl = gl;

      if (this.regen) {
        this.regen = 0;
        this.regen_buffers(gl);
      }

      if (this.points.length < 3) {
        return;
      }


      if (!STENCILMODE) {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        /*
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.depthRange(0.0, 1.0);
        gl.depthFunc(gl.LESS);
        gl.clearDepth(1.0);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        //*/
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.STENCIL_TEST);


        gl.enable(gl.BLEND);
        //gl.disable(gl.BLEND);

        //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        this.draw2(gl, matrix, "vertex", 1, alpha);

        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);

        //gl.depthMask(false);
        //gl.disable(gl.DEPTH_TEST);
        //gl.disable(gl.BLEND);
        return;
      } else {
        //gl.depthMask(false);
      }

      gl.enable(gl.STENCIL_TEST);

      let si = 1 + (this.stencili % 254);

      gl.stencilFunc(gl.EQUAL, 128, 255);
      gl.stencilOp(gl.INCR, gl.KEEP, gl.KEEP);

      this.draw2(gl, matrix, "vertex", 1, alpha);

      gl.stencilOp(gl.REPLACE, gl.KEEP, gl.KEEP);
      this.draw2(gl, matrix, "vertex2", 1, alpha);

      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.stencilFunc(gl.EQUAL, 1, 1);

      this.draw2(gl, matrix, "vertex", 1, alpha);

      gl.disable(gl.STENCIL_TEST);
      this.draw2(gl, matrix, "vertex2", 0, alpha);

    }

    draw2(gl, matrix, buffer, shader, mul) {
      if (STENCILMODE)
        gl.clearStencil(0);

      if (this.points.length < 3) {
        return;
      }

      if (this.shader === undefined) {
        console.log("compiling shader");
        this.compile_shader(gl);
      }

      if (this.regen) {
        this.regen = 0;
        this.regen_buffers(gl);
      }

      var vbuf = this.vbuf;

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer.get(gl, buffer));
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer.get(gl, buffer + "_uv"));
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer.get(gl, buffer + "_color"));
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer.get(gl, buffer + "_co"));
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer.get(gl, buffer + "_uv2"));
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 0, 0);

      shader = this.shader;
      //shader = !shader ? this.shader : this.shader2;

      var canvas = document.getElementById("canvas");

      if (window.T === undefined) {
        window.T = 0;
      }

      window.T += 0.5;

      shader.bind(gl, {
        iRes: [canvas.width, canvas.height],
        aspect: canvas.height / canvas.width,
        matrix: matrix,
        mul: mul,
        texw: this.texw,
        texh: this.texh,
        tex: this.gltex,
        mask: this.texFbo ? this.texFbo.texColor : undefined,
        T: window.T
      });


      gl.drawArrays(gl.TRIANGLES, 0, this.tottris[buffer]);
    }
  };

  var PointFlags = exports.PointFlags = {
    SELECT: 1
  };

  class Point extends Vector2 {
    constructor(co, path) {
      super(co);

      this.path = path;
      this.eidmap = {};
      this.eid = -1;
      this.flag = 0;
      this.index = 0;
    }

    toJSON() {
      return {
        co: [this[0], this[1]],
        flag: this.flag,
        eid: this.eid,
        index: this.index
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
      this.renders = [];

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

      this.renders.length = 0;
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
      }

      let totpoint = 0;
      for (let r of this.renders) {
        totpoint += r.points.length;
      }
      console.log("total vertices:", totpoint);
    }

    draw(gl, width, height) {
      this.gl = gl;

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
          r.texFbo.draw(gl, 0.25, 0.25, 300, 300);
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

  //quadratic bezier path
  var QuadraticPath = exports.QuadraticPath = class QuadraticPath {
    constructor(gl, canvas, render, pmesh) {
      this.gl = gl; //3d api
      this.canvas = canvas;
      this._lastblur = undefined;

      this.on_new_point = undefined;

      this.fillcolor = new vectormath.Vector4([1.0, 0.5, 0.5]);
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

      this.render = render;
      this.pmesh = pmesh;

      this.eidgen = new util.IDGen();
      this.eidmap = {};

      this.points = [];
      this.points.selected = new util.set();

      this.points.setselect = function (p, val) {
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

    regen_render() {

    }

    destroy(gl) {
      this.render.destroy(gl);
    }

    static fromJSON(obj) {
      var ret = new QuadraticPath();
      var mm = new util.MinMax(2);

      ret.blur = obj.blur;
      ret.eidgen = util.IDGen.fromJSON(obj.eidgen);

      for (var i = 0; i < obj.points.length; i++) {
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

    toJSON() {
      var a = this.aabb;

      return {
        eidgen: this.eidgen,
        points: this.points,
        aabb: [[a[0][0], a[0][1]], [a[1][0], a[1][1]]],
        fillcolor: this.fillcolor,
        blur: this.blur,
        active_point: this.points.active != undefined ? this.points.active.eid : -1
      };
    }

    [Symbol.keystr]() {
      return this.eid;
    }

    //co is optional
    make_point(co) {
      var p = new Point(co, this);

      this.render.points.push(p);

      p.eid = this.eidgen.next();
      p.path = this;

      this.points.push(p);
      this.eidmap[p.eid] = p;

      if (this.on_new_point !== undefined) {
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
      for (var i = 0; i < this.points.length; i++) {
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

      for (var i = 0; i < this.points.length; i++) {
        var p = this.points[i];
        var dx = p[0] - x, dy = p[1] - y;
        var dis = dx * dx + dy * dy;

        if (dis < mindis && dis < limit) {
          ret = p;
          mindis = dis;
        }
      }

      return ret;
    }
  }

  return exports;
});
