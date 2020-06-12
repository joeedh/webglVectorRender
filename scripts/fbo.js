var _fbo = undefined;

define([
  "util", "webgl", "vectormath"
], function(util, webgl, vectormath) {
  'use strict';
  
  var exports = _fbo = {};
  var Class = util.Class;
  var Vector2 = vectormath.Vector2;
   
  exports.MAX_BLUR = 55;
  
  function gen_aa_tab(n) {
    var ps = [];
    var ws = [];
    var diag = Math.sqrt(2*n*n);
    var totw = 0.0;
    
    for (var i=-n; i<=n; i++) {
      for (var j=-n; j<=n; j++) {
        var w = Math.sqrt(i*i + j*j)/diag;
        w = 1.0 - w*w;
        w *= w;
        
        //w *= Math.PI*1.75
        //w = Math.sin(w)/w;
        
        //w *= w*w*(3.0-2.0*w);
        
        ps.push([i/diag, j/diag]);
        
        ws.push(w);
        totw += w;
      }
    }
    
    for (var i=0; i<ws.length; i++) {
      ws[i] /= totw;
    }
    
    return [ps, ws];
  }
  
  window.aa_table = {
    1  : [
      [[0, 0]], [1]
    ],
    
    3 : [
      [[-1, -1], [1, -1], [0, 1]],
      [1.0/3.0, 1.0/3.0, 1.0/3.0]
    ],
    
    5  : [
      [[-1, -1], [-1, 1], [1, 1], [1, -1], [0, 0]],
      [0.2, 0.2, 0.2, 0.2, 0.2]
    ],
    9  : gen_aa_tab(1),
    25 : gen_aa_tab(2)
  };
  
  exports.blurshader_cache = {};
  
  exports.get_blurshader = function get_blurshader(gl, fwid) {
    if (fwid in exports.blurshader_cache) {
      return exports.blurshader_cache[fwid];
    }
    
    var vcode = [
      "//vertex",
      "precision mediump float;",
      "attribute vec2 position;",
      "attribute vec2 uv;",
      "",
      "uniform mat4 matrix;",
      "uniform vec2 iRes;",
      "varying vec2 vUv;",
      
      "void main() {",
      " vUv = uv;",
      "vec2 p = vec2(2.0,2.0)*(position/iRes)-1.0;",
      " gl_Position = matrix * vec4(p, 0.0, 1.0);",
      "}"
    ].join("\n");
    
    var fcode = [
      "//fragment",
      "precision mediump float;",
      "varying vec2 vUv;",
      "",
      "uniform sampler2D texture;",
      "uniform vec2 iRes;",
      "",
      "void main() {",
      "",
      
      "vec4 sum=vec4(0.0, 0.0, 0.0, 0.0);",
      "float mul=1.0/float(FWID), mul2=1.0/iRes.x;",
      "",
      "for (int i=0; i<FWID; i++) {",
      "  float fi = float(i) - float(FWID)*0.5;",
      "LINE",
      //"  c.xyz /= c.w;",
      "sum += c*mul;",
      //"  sum += mix(c, vec4(1.0, 1.0, 1.0, 0.0), 1.0-c[3])*mul;",
      "}",
      //"  sum.xyz *= sum.w;",
      "  gl_FragColor = vec4(sum.rgb, sum[3]);",
      "}"
    ].join("\n").replace(/FWID/g, fwid);
    
    var fcode1 = fcode.replace("LINE", "  vec4 c = texture2D(texture, vec2(fi*mul2, 0.0)+vUv);");
    var fcode2 = fcode.replace("LINE", "  vec4 c = texture2D(texture, vec2(0.0, fi*mul2)+vUv);");

    var shader1 = new webgl.ShaderProgram(gl, vcode, fcode1, ["position", "uv"]);
    shader1.init(gl);
    shader1.fwid = fwid;
    
    var shader2 = new webgl.ShaderProgram(gl, vcode, fcode2, ["position", "uv"]);
    shader1.init(gl);
    shader1.fwid = fwid;
    
    exports.blurshader_cache[fwid] = [shader1, shader2];
    return exports.blurshader_cache[fwid];
  }
  
  var Rect = exports.Rect = Class([
    function constructor(width, height) {
      this.size = [width, height];
      this.regen = 1;
      
      this.vbuf = undefined;
      this.uvbuf = undefined;
      this.matrix = new vectormath.Matrix4();
      this.params = {
        matrix  : this.matrix,
        iRes    : [0, 0],
        mul     : 1.0
      //  texture : undefined
      };
    },
    
    function destroy(gl) {
      //already destroyed?
      if (this.vbuf === undefined)
        return; 
      
      gl.deleteTexture(this.vbuf);
      gl.deleteTexture(this.uvbuf);
        
      this.vbuf = this.uvbuf = undefined;
    },
    
    function gen_buffers(gl) {
      var vcos = [
         0, 0, 0, this.size[1], this.size[0], this.size[1],
         0, 0, this.size[0], this.size[1], this.size[0], 0
      ];
      
      var uvs = [
         0, 0, 0, 1, 1, 1,
         0, 0, 1, 1, 1, 0
      ];
      
      this.vbuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vcos), gl.STATIC_DRAW);

      this.uvbuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvbuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
    },
    
    function draw(gl, tex, x, y, resx, resy, mul) {
      x = x == undefined ? 0 : x;
      y = y == undefined ? 0 : y;
      
      if (this.regen) {
        this.regen = 0;
        this.gen_buffers(gl);
      }
      
      if (gl.rectshader == undefined) {
        this.compile_shader(gl);
        this.compile_premul_shader(gl);
      }
      
      this.matrix.makeIdentity();
      this.matrix.translate(x, y, 0.0);
      
      if (this.shader == undefined) {
        this.shader = gl.rectshader;
      }
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      
      this.params.iRes[0] = resx, this.params.iRes[1] = resy;
      
      if (mul != undefined) {
        this.params.mul = mul;
      } else {
        this.params.mul = 1.0;
      }
      
      this.shader.bind(gl, this.params);
      if (mul != undefined) {
        gl.uniform1f(this.shader.uniformloc("mul"), mul);
      }
      
      gl.uniform1i(this.shader.uniformloc("texture"), 0);
      
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      
      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvbuf);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
      
      gl.disableVertexAttribArray(2);
      gl.disableVertexAttribArray(3);
      gl.disableVertexAttribArray(4);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindTexture(gl.TEXTURE_2D, null);
    },
    
    function compile_shader(gl) {
      var vcode = [
        "//vertex",
        "precision mediump float;",
        "attribute vec2 position;",
        "attribute vec2 uv;",
        "",
        "uniform mat4 matrix;",
        "uniform vec2 iRes;",
        "varying vec2 vUv;",
        
        "void main() {",
        " vUv = uv;",
        "vec2 p = vec2(2.0,2.0)*(position/iRes)-1.0;",
        " gl_Position = matrix * vec4(p, 0.0, 1.0);",
        "}"
      ].join("\n");
      
      var fcode = [
        "//fragment",
        "precision mediump float;",
        "varying vec2 vUv;",
        "",
        "uniform sampler2D texture;",
        "uniform float mul;",
        "",
        "void main() {",
        "  gl_FragColor.xyzw = texture2D(texture, vUv);",
        //"  gl_FragColor.xyz *= gl_FragColor.w;",
        "  gl_FragColor *= vec4(mul,mul,mul,mul);",
        "}"
      ].join("\n");
      
      var shader = new webgl.ShaderProgram(gl, vcode, fcode, ["position", "uv"]);
      shader.init(gl);
      
      gl.rectshader = shader;
      return shader;
    },
    
    function compile_premul_shader(gl) {
      var vcode = [
        "//vertex",
        "precision mediump float;",
        "attribute vec2 position;",
        "attribute vec2 uv;",
        "",
        "uniform mat4 matrix;",
        "uniform vec2 iRes;",
        "varying vec2 vUv;",
        
        "void main() {",
        "  vUv = uv;",
        "  vec2 p = vec2(2.0,2.0)*(position/iRes)-1.0;",
        "  gl_Position = matrix * vec4(p, 0.0, 1.0);",
        "}"
      ].join("\n");
      
      var fcode = [
        "//fragment",
        "precision mediump float;",
        "varying vec2 vUv;",
        "",
        "uniform sampler2D texture;",
        "uniform float mul;",
        "",
        "void main() {",
        "  vec4 color = texture2D(texture, vUv);",
        "  if (color.w == 0.0) {",
        "    discard;",
        "  }",
        
        //"  color.xyz = vec3(0.5, 0.2, 0.8);",
        "  color.xyz /= color.w;",
        //"  color.w = pow(color.w, 4.0);",
        "  gl_FragColor = color;",
        "}"
      ].join("\n");
      
      var shader = new webgl.ShaderProgram(gl, vcode, fcode, ["position", "uv"]);
      shader.init(gl);
      
      gl.rectshader_premul = shader;
      return shader;
    }
  ]);
  
  var cached_rects = {};
  
  var FBO = exports.FBO = Class([
    function constructor(width, height) {
      this.size = [width, height];
      this.regen = 1;
      
      this.fbuf = undefined;
      this.colortex = undefined;
      this.stenciltex = undefined;
      
      this._lastsize = new vectormath.Vector4();
    },
    
    function draw(gl, x, y, resx, resy, shader, mul) {
      var key = this.size[0] + "," + this.size[1];
      var rect;
      
      if (key in cached_rects) {
        rect = cached_rects[key]
      } else {
        rect = new Rect(this.size[0], this.size[1]);
        cached_rects[key] = rect;
      }
      
      if (shader != undefined) {
        rect.shader = shader;
      } else {
        rect.shader = gl.rectshader;
      }
      
      rect.draw(gl, this.colortex, x, y, resx, resy, mul);
    },
    
    function gen_buffers(gl) {
      this.regen = 0;
      
      if (this.size[0] == 0 || this.size[1] == 0 || isNaN(this.size[0]*this.size[1]))
        return;
      
      this.fbuf = gl.createFramebuffer();
      this.colortex = gl.createTexture();
      
      gl.bindTexture(gl.TEXTURE_2D, this.colortex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.size[0], this.size[1], 0, gl.RGBA,
                    gl.UNSIGNED_BYTE, new Uint8Array(this.size[0]*this.size[1]*4));
      
      /*
      gl.bindTexture(gl.TEXTURE_2D, this.stenciltex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, this.size[0], this.size[1], 0, gl.RGB,
                    gl.UNSIGNED_SHORT_5_6_5, new Uint16Array(3*this.size[0]*this.size[1]));
      
      */
      this.stencilbuf = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.stencilbuf);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, this.size[0], 
                             this.size[1]);
      
      
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbuf);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, 
                              gl.TEXTURE_2D, this.colortex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, 
                              gl.RENDERBUFFER, this.stencilbuf);
      //gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, 
      //                        gl.TEXTURE_2D, this.stenciltex, 0);
      
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    },
    
    function destroy(gl) {
      gl.deleteTexture(this.colortex);
      //gl.deleteTexture(this.stenciltex);
      gl.deleteRenderbuffer(this.stencilbuf);
      gl.deleteFramebuffer(this.fbuf);
    },
    
    function bind(gl) {
      if (this.regen) {
        this.regen = 0;
        this.gen_buffers(gl);
      }
      
      this._lastsize.load(gl.getParameter(gl.VIEWPORT));
      
      gl.viewport(0, 0, this.size[0], this.size[1]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbuf);
    },
    
    function unbind(gl) {
      var l = this._lastsize;
      gl.viewport(l[0], l[1], l[2], l[3]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  ]);

  let fbopool = [];

  function fboPoolHas(key) {
    for (let item of fbopool) {
      if (item[0] === key) {
        console.log("fbo has", key)
        return true;
      }
    }
  }

  function fboPoolAdd(key, fbo) {
    console.log("fbo add", key)
    fbopool.push([key, fbo]);
  }

  function fboPoolGet(key) {
    for (let item of fbopool) {
      if (item[0] === key) {
        console.log("fbo get", key)

        fbopool.remove(item);
        return item[1];
      }
    }
  }

  exports.flushFBOPool = function(gl) {
    for (let item of fbopool) {
      item[1].destroy(gl);
    }
    fbopool.length = 0;
  }

  window._fbopool = fbopool;

  function fbokey(w, h, key) {
    return "" + (~~w) + ":" + (~~h) + ":" + key;
  }

  var PathDrawer = exports.PathDrawer = util.Class([
    function constructor(path) {
      this.paths = path != undefined ? [path] : [];
      this.mm = new util.MinMax(2);
      this.mm.min = new Vector2(), this.mm.max = new Vector2();
      this.aabb = [this.mm.min, this.mm.max];
      this.blur = 0;
      
      this.fbo = undefined;
      this.recalc = 1;
      this.renders = [];
      
      this.matrix = new vectormath.Matrix4();
      this.matrix2 = new vectormath.Matrix4();
    },

    function destroyFBOs() {
      let key = fbokey(this.fbo.size[0], this.fbo.size[1], "1");
      let key2 = fbokey(this.fbo2.size[0], this.fbo2.size[1], "2");

      //this.fbo.destroy(gl);
      //this.fbo2.destroy(gl);
      fboPoolAdd(key, this.fbo);
      fboPoolAdd(key2, this.fbo2);
    },

    function destroy(gl) {
      this.destroyFBOs();
    },

    function draw_common(gl, screenwidth, screenheight, blur) {
      this.mm.reset();
      for (var i=0; i<this.paths.length; i++) {
        this.mm.minmax(this.paths[i].aabb[0]);
        this.mm.minmax(this.paths[i].aabb[1]);
      }
      
      var bb = this.aabb;
      var pad = Math.max(blur, 2);
      
      this.fbo_pad = pad;
      
      var wid = ~~(2.0*pad + bb[1][0] - bb[0][0]+1.0);
      var hgt = ~~(2.0*pad + bb[1][1] - bb[0][1]+1.0);


      if (this.fbo === undefined) {
        let key = fbokey(wid, hgt, "1");

        if (fboPoolHas(key)) {
          console.log("Loading cache fbo");

          let key2 = fbokey(wid, hgt, "2");

          this.fbo = fboPoolGet(key);
          this.fbo2 = fboPoolGet(key2);
        }
      }

      if (this.fbo === undefined || this.fbo.size[0] !== wid || this.fbo.size[1] !== hgt) {
        console.log("regenerating fbos", wid, hgt);
        
        if (this.fbo !== undefined) {
          this.destroyFBOs();
        }
        
        console.log(wid, hgt);
        
        this.fbo = new FBO(wid, hgt);
        this.fbo.gen_buffers(gl);
        
        this.fbo2 = new FBO(wid, hgt);
        this.fbo2.gen_buffers(gl);
      }
      
      this.fbo.bind(gl);

      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      if (STENCILMODE) gl.clearStencil(0);

      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    },
    
    function draw_antialias(gl, screenwidth, screenheight) {
      //note that fbo is already bound when we get here
      var bb = this.aabb;
      
      var wid = this.fbo.size[0];
      var hgt = this.fbo.size[1];
      var pad = this.fbo_pad;
      
      //var asp = hgt/wid;
      
      var mat = this.matrix;

      mat.makeIdentity();
      mat.translate(-1.0, -1.0, 0.0);

      mat.scale(2.0 / wid, 2.0 / hgt, 1.0);
      mat.translate(-bb[0][0]+pad, -bb[0][1]+pad);
      
      var startmat = this.matrix2;
      startmat.load(mat);
      
      var off = aa_table[1];
      var filter = 0.8;
      
      gl.enable(gl.BLEND);
      //gl.blendEquation(gl.FUNC_ADD);
      
      //gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
      //gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
      
      this.fbo.unbind(gl);
      
      //gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      //gl.bindTexture(gl.TEXTURE_2D, this.fbo2.colortex);
      //gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bb[0][0]-pad, bb[0][1]-pad, wid, hgt, 0.0);
      
      this.fbo2.bind(gl);
      
      gl.clearColor(0, 0, 0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      this.fbo2.unbind(gl);

      //really crappy temporal antialiasing
      var offdx = (Math.random()-0.5)*1.0*(1.0/off[0].length);
      var offdy = (Math.random()-0.5)*1.0*(1.0/off[0].length);

      /*
      for (var i=0; i<off[0].length; i++) {
        var w = off[1][i];

        var dx = off[0][i][0], dy = off[0][i][1];

        dx += offdx, dy += offdy;
        dx = (filter*dx)/this.fbo.size[0];
        dy = (filter*dy)/this.fbo.size[1];

        mat.makeIdentity();
        mat.translate(dx, dy, 0.0);
        mat.multiply(startmat);

        //mat.translate(0, screenheight, 0);
        //mat.scale(1, -1, 1);

        //mat.translate(dx, dy, 0.0);

        this.fbo.bind(gl);

        if (STENCILMODE) gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

        gl.disable(gl.BLEND);

        for (let r of this.renders) {
          if (STENCILMODE) gl.clear(gl.STENCIL_BUFFER_BIT);
          r.draw(gl, mat, 1.0, screenwidth, screenheight);
        }

        //gl.enable(gl.BLEND);

        this.fbo.unbind(gl);
        this.fbo2.bind(gl);
        this.fbo.draw(gl, 0, 0, this.fbo.size[0], this.fbo.size[1], undefined, w);
        this.fbo2.unbind(gl);

        break;
      }*/

      //*
      this.fbo2.bind(gl);

      if (STENCILMODE) gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

      gl.blendFuncSeparate(
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
        gl.SRC_ALPHA, gl.DST_ALPHA, //ONE_MINUS_SRC_ALPHA
        //gl.ONE, gl.ZERO
      );//*/
      gl.enable(gl.BLEND);

      for (let r of this.renders) {
        if (STENCILMODE) gl.clear(gl.STENCIL_BUFFER_BIT);

        r.draw(gl, startmat, 1.0, screenwidth, screenheight);
      }

      this.fbo2.unbind(gl);

      //*
      gl.blendFuncSeparate(
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
        gl.ZERO, gl.ONE
      );//*/

      var x = bb[0][0]-pad, y = bb[0][1]-pad;
      this.fbo2.draw(gl, 2.0*x/screenwidth, 2.0*y/screenheight,
        screenwidth, screenheight); //, gl.rectshader_premul);
      return;
      //*/

      //*
      gl.blendFuncSeparate(
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA
        //gl.ONE, gl.ONE//SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA
      );//*/

      //gl.blendColor(1.0, 0.0, 1.0, 1.0);
      //gl.disable(gl.BLEND);
      
      var x = bb[0][0]-pad, y = bb[0][1]-pad;
      this.fbo2.draw(gl, 2.0*x/screenwidth, 2.0*y/screenheight, 
                     screenwidth, screenheight, gl.rectshader_premul);
    },
    
    function draw_blur(gl, screenwidth, screenheight, blur) {
      var bb = this.aabb;
      
      var wid = this.fbo.size[0];
      var hgt = this.fbo.size[1];
      var pad = this.fbo_pad;
      
      var mat = this.matrix;

      mat.makeIdentity();
      mat.translate(-1.0, -1.0, 0.0);

      mat.scale(2.0 / wid, 2.0 / hgt, 1.0);
      mat.translate(-bb[0][0]+pad, -bb[0][1]+pad);
      
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.blendFuncSeparate(
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
      );

      for (let r of this.renders) {
        if (STENCILMODE) gl.clear(gl.STENCIL_BUFFER_BIT);
        r.draw(gl, mat, 1.0, screenwidth, screenheight);
      }
      //gl.colorMask(1,1,1,1);

      /*gl.colorMask(0, 0, 0, 1);
      gl.clearColor(0,0,0,1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.colorMask(1, 1, 1, 1);
      //*/

      this.fbo.unbind(gl);
      this.fbo2.bind(gl);
      
      //gl.clearColor(fc[0], fc[1], fc[2], 0);
      gl.clearColor(1, 1, 1, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      //gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      //gl.bindTexture(gl.TEXTURE_2D, this.fbo2.colortex);
      //gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bb[0][0]-pad, bb[0][1]-pad, wid, hgt, 0.0);
      
      this.fbo2.unbind(gl);
      
      //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      var blur2 = Math.min(blur, exports.MAX_BLUR), add = 0;
      if (blur > exports.MAX_BLUR) {
        add = Math.ceil(2.0*blur/exports.MAX_BLUR);
      }
      
      var blurshaders = exports.get_blurshader(gl, blur2);

      //*
      gl.blendEquation(gl.FUNC_ADD);

      gl.blendFuncSeparate(
        gl.ONE, gl.ZERO,
        gl.ONE, gl.ZERO
        //gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
        //gl.ONE, gl.ZERO//gl.SRC_ALPHA, gl.DST_ALPHA
        //gl.ONE_MINUS_DST_ALPHA, gl.DST_ALPHA//gl.ZERO, gl.ONE
        //gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA
      );
      //*/


      for (var i=0; i<2+add; i++) {
        this.fbo2.bind(gl);
        this.fbo.draw(gl, 0, 0, this.fbo.size[0], this.fbo.size[1], blurshaders[0]);
        this.fbo2.unbind(gl);

        this.fbo.bind(gl);
        this.fbo2.draw(gl, 0, 0, this.fbo.size[0], this.fbo.size[1], blurshaders[1]);
        this.fbo.unbind(gl);
      }
      
      var x = bb[0][0]-pad, y = bb[0][1]-pad;

      gl.blendFuncSeparate(
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
        //gl.ZERO, gl.ONE
        //gl.ONE, gl.ZERO//gl.SRC_ALPHA, gl.DST_ALPHA
        //gl.ONE_MINUS_DST_ALPHA, gl.DST_ALPHA//gl.ZERO, gl.ONE
        //gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA
      );
      //*/

      this.fbo.draw(gl, 2.0*x/screenwidth, 2.0*y/screenheight, screenwidth, screenheight);
    },
    
    function draw(gl, screenwidth, screenheight, blur) {
      blur = blur === undefined ? 0 : blur;
      
      this.draw_common(gl, screenwidth, screenheight, blur);
      
      if (blur === 0) {
        this.draw_antialias(gl, screenwidth, screenheight);
      } else {
        this.draw_blur(gl, screenwidth, screenheight, blur);
      }

      gl.blendFuncSeparate(
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
        //gl.DST_ALPHA, gl.DST_ALPHA//gl.ZERO, gl.ONE
      );
    }
  ]);
  
  return exports;
});
