var _webgl = undefined;

define([
  "util", "vectormath"
], function(util, vectormath) {
  "use strict";
  
  var exports = _webgl = {};

  var Vector2 = vectormath.Vector2;
  var Vector3 = vectormath.Vector3;
  var Vector4 = vectormath.Vector4;
  var Matrix4 = vectormath.Matrix4;
  var Quat = vectormath.Quat;
  
  
  //params are passed to canvas.getContext as-is
  exports.init_webgl = function init_webgl(canvas, params) {
    var gl = canvas.getContext("webgl", params);
    gl.getExtension("OES_standard_derivatives");
    
    return gl;
  }

  function format_lines(script) {
    var i = 1;
    
    var lines = script.split("\n")
    var maxcol = Math.ceil(Math.log(lines.length) / Math.log(10))+1;
    
    var s = "";
    
    for (var line of lines) {
      s += ""+i + ":";
      while (s.length < maxcol) {
        s += " "
      }
      
      s += line + "\n";
      i++;
    }
    
    return s;
  }

  //
  // loadShader
  //
  // 'shaderId' is the id of a <script> element containing the shader source string.
  // Load this shader and return the WebGLShader object corresponding to it.
  //
  function loadShader(ctx, shaderId)
  {   
      var shaderScript = document.getElementById(shaderId);
      
      if (!shaderScript) {
        shaderScript = {text : shaderId, type : undefined};
        
        if (shaderId.trim().toLowerCase().startsWith("//vertex")) {
          shaderScript.type = "x-shader/x-vertex";
        } else if (shaderId.trim().toLowerCase().startsWith("//fragment")) {
          shaderScript.type = "x-shader/x-fragment";
        } else {
          console.trace();
          console.log("Invalid shader type");
          console.log("================");
          console.log(format_lines(shaderScript.text));
          console.log("================");
          throw new Error("Invalid shader type for shader script;\n script must start with //vertex or //fragment");
        }
      }

      if (shaderScript.type == "x-shader/x-vertex")
          var shaderType = ctx.VERTEX_SHADER;
      else if (shaderScript.type == "x-shader/x-fragment")
          var shaderType = ctx.FRAGMENT_SHADER;
      else {
          log("*** Error: shader script '"+shaderId+"' of undefined type '"+shaderScript.type+"'");
          return null;
      }

      // Create the shader object
      if (ctx == undefined || ctx == null || ctx.createShader == undefined)
        console.trace();
        
      var shader = ctx.createShader(shaderType);

      // Load the shader source
      ctx.shaderSource(shader, shaderScript.text);

      // Compile the shader
      ctx.compileShader(shader);

      // Check the compile status
      var compiled = ctx.getShaderParameter(shader, ctx.COMPILE_STATUS);
      if (!compiled && !ctx.isContextLost()) {
          // Something went wrong during compilation; get the error
          var error = ctx.getShaderInfoLog(shader);
          
          console.log(format_lines(shaderScript.text));
          console.log("\nError compiling shader: ", error);
          
          ctx.deleteShader(shader);
          return null;
      }

      return shader;
  }

  var _safe_arrays = [
    0,
    0,
    new Float32Array(2),
    new Float32Array(3),
    new Float32Array(4),
  ];

  exports.ShaderProgram = class ShaderProgram {
    constructor(gl, vertex, fragment, attributes) {
      this.vertexSource = vertex;
      this.fragmentSource = fragment;
      this.attrs = [];
      
      for (var a of attributes) {
        this.attrs.push(a);
      }
      
      this.rebuild = 1;
      
      this.uniformlocs = {};
      this.attrlocs = {};
      
      this.uniforms = {};
      this.gl = gl;
    }
    
    init(gl) {
      this.gl = gl;
      this.rebuild = false;
      
      var vshader = this.vertexSource, fshader = this.fragmentSource;
      
      // create our shaders
      var vertexShader = loadShader(gl, vshader);
      var fragmentShader = loadShader(gl, fshader);
      
      // Create the program object
      var program = gl.createProgram();

      // Attach our two shaders to the program
      gl.attachShader (program, vertexShader);
      gl.attachShader (program, fragmentShader);

      var attribs = this.attrs;
      
      // Bind attributes
      for (var i = 0; i < attribs.length; ++i)
          gl.bindAttribLocation (program, i, attribs[i]);

      // Link the program
      gl.linkProgram(program);

      // Check the link status
      var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
      if (!linked && !gl.isContextLost()) {
          // something went wrong with the link
          var error = gl.getProgramInfoLog (program);
          console.log("Error in program linking:"+error);

          //do nothing
          //gl.deleteProgram(program);
          //gl.deleteProgram(fragmentShader);
          //gl.deleteProgram(vertexShader);

          return null;
      }
      
      console.log("created shader", program);

      this.program = program;

      this.gl = gl;
      this.vertexShader = vertexShader;
      this.fragmentShader = fragmentShader;
      this.attrs = [];
      
      this.attrlocs = {};
      this.uniformlocs = {};
      
      this.uniforms = {}; //default uniforms
      
      for (var i=0; i<attribs.length; i++) {
        this.attrs.push(i);
        this.attrlocs[attribs[i]] = i;
      }
    }
    
    static load_shader(path, attrs) {
        var ret = new ShaderProgram(undefined, undefined, undefined, ["position", "normal", "uv", "color", "id"]);
        ret.ready = false;
        
        ret.init = function(gl) {
          if (!this.ready) {
            return;
          }
          
          return ShaderProgram.prototype.init.call(this, gl);
        }
        
        ret.promise = util.fetch_file(path).then(function(text) {
          console.log("loaded file");
          
          var lowertext = text.toLowerCase();
          var vshader = text.slice(0, lowertext.search("//fragment"));
          var fshader = text.slice(lowertext.search("//fragment"), text.length);
          
          ret.vertexSource = vshader;
          ret.fragmentSource = fshader;
          ret.ready = true;
        });
        
        ret.then = function() {
          return this.promise.then.apply(this.promise, arguments);
        }
        
        return ret;
    }
    
    on_gl_lost(newgl) {
      this.rebuild = 1;
      this.gl = newgl;
      this.program = undefined;
      
      this.uniformlocs = {};
    }
    
    uniformloc(name) {
      if (this.uniformlocs[name] == undefined) {
        this.uniformlocs[name] = this.gl.getUniformLocation(this.program, name);
      }
      
      return this.uniformlocs[name];
    }
    
    attrloc(name) {
      return this.attrlocs[name];
    }
    
    bind(gl, uniforms) {
      this.gl = gl;
      
      if (this.rebuild) {
        this.init(gl);
        
        if (this.rebuild) 
          return; //failed to initialize
      }
      
      function setv(dst, src, n) {
        for (var i=0; i<n; i++) {
          dst[i] = src[i];
        }
      }
      
      gl.useProgram(this.program);
      this.gl = gl;
      
      for (var i=0; i<2; i++) {
        var us = i ? uniforms : this.uniforms;
        
        for (var k in us) {
          var v = us[k];
          var loc = this.uniformloc(k)
          
          if (loc == undefined) {
              //stupid gl returns null if it optimized away the uniform,
              //so we must silently accept this
              //console.log("Warning, could not locate uniform", k, "in shader");
              continue;
          }
          
          if (v instanceof exports.Texture) {
            v.bind(gl, this.uniformloc(k));
          } else if (v instanceof Array) {
            switch (v.length) {
              case 2:
                var arr = _safe_arrays[2];
                setv(arr, v, 2);
                gl.uniform2fv(loc, arr);
                break;
              case 3:
                var arr = _safe_arrays[3];
                setv(arr, v, 3);
                gl.uniform3fv(loc, arr);
                break;
              case 4:
                var arr = _safe_arrays[4];
                setv(arr, v, 4);
                gl.uniform4fv(loc, arr);
                break;
            }
          } else if (v instanceof Matrix4) {
            v.setUniform(gl, loc);
          } else if (typeof v == "number") { 
            gl.uniform1f(loc, v);
          } else {
            throw new Error("Invalid uniform");
          }
        }
      }
      
      return this;
    }
  }

  exports.RenderBuffer = class RenderBuffer {
    constructor() {
      this._layers = {};
    }
    
    get(gl, name) {
      if (this[name] != undefined) {
        return this[name];
      }
      
      var buf = gl.createBuffer();
      
      this._layers[name] = buf;
      this[name] = buf;
      
      return buf;
    }
    
    destroy(gl, name) {
      if (name == undefined) {
        for (var k in this._layers) {
          gl.deleteBuffer(this._layers[k]);
          
          this._layers[k] = undefined;
          this[k] = undefined;
        }
      } else {
        if (this._layers[name] == undefined) {
          console.trace("WARNING: gl buffer no in RenderBuffer!", name, gl);
          return;
        }
        
        gl.deleteBuffer(this._layers[name]);
        
        this._layers[name] = undefined;
        this[name] = undefined;
      }
    }
  }

  exports.Texture = class Texture {
    constructor() {
    }
    
    bind(gl, uniformloc) {
    }
  }

  //cameras will derive from this class
  exports.DrawMats = class DrawMats {
    constructor() {
      this.cameramat = new Matrix4();
      this.persmat = new Matrix4();
      this.rendermat = new Matrix4();
      this.normalmat = new Matrix4();
      
      this.icameramat = new Matrix4();
      this.ipersmat = new Matrix4();
      this.irendermat = new Matrix4();
      this.inormalmat = new Matrix4();
    }
    
    regen_mats(aspect) {
      this.aspect = aspect;
      
      this.normalmat.load(this.cameramat).makeRotationOnly();
      
      this.icameramat.load(this.cameramat).invert();
      this.ipersmat.load(this.cameramat).invert();
      this.irendermat.load(this.cameramat).invert();
      this.inormalmat.load(this.normalmat).invert();
      
      return this;
    }
    
    toJSON() {
      return {
        cameramat  : this.cameramat.getAsArray(),
        persmat    : this.persmat.getAsArray(),
        rendermat  : this.rendermat.getAsArray(),
        normalmat  : this.normalmat.getAsArray(),
        
        icameramat : this.icameramat.getAsArray(),
        ipersmat   : this.ipersmat.getAsArray(),
        irendermat : this.irendermat.getAsArray(),
        inormalmat : this.inormalmat.getAsArray()
      }
    }
    
    loadJSON(obj) {
      this.cameramat.load(obj.cameramat);
      this.persmat.load(obj.persmat);
      this.rendermat.load(obj.rendermat);
      this.normalmat.load(obj.normalmat);
      
      this.icameramat.load(obj.icameramat);
      this.ipersmat.load(obj.ipersmat);
      this.irendermat.load(obj.irendermat);
      this.inormalmat.load(obj.inormalmat);
      
      return this;
    }
  }

  //simplest camera
  exports.Camera = class Camera extends exports.DrawMats {
    constructor() {
      super();
      
      this.fovy = 35;
      this.aspect = 1.0;
      
      this.pos = new Vector3([0, 0, 5]);
      this.target = new Vector3();
      this.up = new Vector3([1, 3, 0]);
      this.up.normalize();
      
      this.near = 0.01;
      this.far = 10000.0;
    }
    
    toJSON() {
      var ret = super.toJSON();
      
      ret.fovy = this.fovy;
      ret.near = this.near;
      ret.far = this.far;
      ret.aspect = this.aspect;
      
      ret.target = this.target.slice(0);
      ret.pos = this.pos.slice(0);
      ret.up = this.up.slice(0);
      
      return ret;
    }
    
    loadJSON(obj) {
      super.loadJSON(obj);
      
      this.fovy = obj.fovy;
      
      this.near = obj.near;
      this.far = obj.far;
      this.aspect = obj.aspect;
      
      this.target.load(obj.target);
      this.pos.load(obj.pos);
      this.up.load(obj.up);
      
      return this;
    }
    
    regen_mats(aspect) {  
      this.aspect = aspect;
      
      this.persmat.makeIdentity();
      this.persmat.perspective(this.fovy, aspect, this.near, this.far);
      
      this.cameramat.makeIdentity();
      this.cameramat.lookat(this.pos, this.target, this.up);    //this.cameramat.translate(this.pos[0], this.pos[1], this.pos[2]);
      
      this.rendermat.load(this.persmat).multiply(this.cameramat);
      //this.rendermat.load(this.cameramat).multiply(this.persmat);
      
      super.regen_mats(aspect); //will calculate iXXXmat for us
    }
  }
  
  return exports;
});
