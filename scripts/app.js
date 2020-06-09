var _app = undefined; //for debugging purposes only.  don't write code with it

define([
  "util", "mesh", "mesh_tools", "mesh_editor", "const", "simple_toolsys",
  "transform", "events", "config", "ui", "image", "curve", "webgl", "fbo"
], function(util, mesh, mesh_tools, mesh_editor, cconst, toolsys,
            transform, events, config, ui, image, curve, webgl, fbo)
{
  'use strict';
  
  var exports = _app = {};
  
  window.STARTUP_FILE_NAME = "startup_file_rs32";
  
  var AppState = exports.AppState = class AppState extends events.EventHandler {
    constructor(gl, canvas) {
      super();
      
      this.fps = new Array(16);
      this.fps.cur = 0;
      
      this.gl = gl;
      this.canvas = canvas;
      
      this.last_draw = util.time_ms();
      
      this.last_save = 0;
      this.canvas2d = document.getElementById("canvas2d");
      this.g = this.canvas2d.getContext("2d");
      this.mesh = new mesh.Mesh();
      
      this.ctx = new toolsys.Context();
      this.toolstack = new toolsys.ToolStack();
      this.editor = new mesh_editor.MeshEditor();
      
      this.pmesh = new curve.PathMesh();
      
      this.makeGUI();
      this.image = undefined;
    }
    
    makeGUI() {
      this.gui = new ui.UI(STARTUP_FILE_NAME+"_gui1", config);
      this.gui.slider("EXAMPLE_PARAM", "Example Param", 128, 1, 512, true, false);
      this.gui.check("EXAMPLE_OPTION", "Example Option");
      
      this.gui.button("load_image", "Load Image", () => {
        console.log("load image!");
        image.loadImageFile().then((imagedata) => {
          console.log("got image!", imagedata);
          
          this.image = imagedata;
          window.redraw_all();
        });
      });
      
      this.gui.load();
    }
    
    setsize() {
      var w = window.innerWidth, h = window.innerHeight;
      
      var eventfire = this.canvas2d.width != w || this.canvas2d.height != h;
      
      if (this.canvas2d.width != w) {
        this.canvas2d.width = w;
        this.canvas2d.height = h;
        
        if (this.canvas) {
          this.canvas.width = w;
          this.canvas.height = h;
        }
      }
      
      if (eventfire)
        this.on_resize([w, h]);
    }
    
    doFPS() {
      var time = util.time_ms() - this.last_draw;
      this.last_draw = util.time_ms();
      
      var fps = 1000.0 / time;
      
      this.fps[this.fps.cur++] = fps;
      this.fps.cur = this.fps.cur % this.fps.length;
      
      var sum=0, tot=0;
      for (var i=0; i<this.fps.length; i++) {
        if (this.fps[i] != undefined) {
          sum += this.fps[i];
          tot += 1;
        }
      }
      
      fps = sum / tot;
      fps = fps.toFixed(1);
      
      document.getElementById("fps").innerText = fps + "fps";
    }
    
    regen() {
      console.log("generating");
      
      this.pmesh.destroy(this.gl);
      let pm = this.pmesh = new curve.PathMesh();
      
      let mesh = this.mesh;
      for (let f of mesh.faces) {
        let path = pm.make_path();
        
        for (let list of f.lists) {
          for (let l of list) {
            let h = l.e.h;
            
            let p = path.make_point([l.v[0], this.canvas.height-l.v[1]]);
            path.make_point([h[0], this.canvas.height-h[1]]);
          }
        }
        
        path.blur = f.blur;
        path.recalc_aabb();
      }
    }
    
    draw() {
      if (this.toolstack.updateGen !== this.updateGen) {
        this.updateGen = this.toolstack.updateGen;
        this.regen();
      }
      
      this.doFPS();
      
      this.setsize();
      this.g.clearRect(0, 0, this.canvas2d.width, this.canvas2d.height);
      
     var gl = this.gl;
    
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      
      //this.canvas.style.background = "rgba(50, 125, 220, 1.0)";
      gl.clearColor(0.2, 0.4, 0.75, 1.0);
      gl.clearStencil(0);
      
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      
      this.pmesh.draw(gl, this.canvas.width, this.canvas.height);

      this.editor.draw(this.ctx, this.canvas2d, this.g);
      window.redraw_all();
    }
    
    genFile() {
      return JSON.stringify(this);
    }
    
    save() {
      localStorage[STARTUP_FILE_NAME] = this.genFile();
    }

    clearStartupFile() {
      delete localStorage[STARTUP_FILE_NAME];
    }
    
    load(buf) {
      buf = buf === undefined ?  localStorage[STARTUP_FILE_NAME] : buf;
      
      try {
        this.loadJSON(JSON.parse(buf));
        this.gui.load();
      } catch (error) {
        util.print_stack(error);
        
        console.warn("Failed to load start-up file");
        return false;
      }
      
      this.gui.update();
      return true;
    }
    
    toJSON() {
      return {
        version : cconst.APP_VERSION,
        mesh    : this.mesh,
        config  : config
      };
    }
    
    loadJSON(obj) {
      this.mesh = new mesh.Mesh();
      this.mesh.loadJSON(obj.mesh);
      
      console.log(obj.config, "yay");
      
      if (obj.config !== undefined) {
        config.loadJSON(obj.config);
      }
      
      window.redraw_all();
      return this;
    }
    
    on_resize(newsize) {
      console.log("resize event");
      this.editor.on_resize(newsize);
    }
    
    on_mousedown(e) {
      this.editor.on_mousedown(e);
    }
    
    on_mousemove(e) {
      this.editor.on_mousemove(e);
    }
    
    on_mouseup(e) {
      this.editor.on_mouseup(e);
    }
    
    on_tick() {
      this.editor.on_tick();
      
      /*
      if (util.time_ms() - this.last_save > 900) {
        console.log("autosaving");
        this.save();
        
        this.last_save = util.time_ms();
      }
      //*/
    }
    
    on_keydown(e) {
      switch (e.keyCode) {
        case 90: //zkey
          if (e.ctrlKey && e.shiftKey && !e.altKey) {
            this.toolstack.redo();
            window.redraw_all();
          } else if (e.ctrlKey && !e.altKey) {
            this.toolstack.undo();
            window.redraw_all();
          }
          break;
        case 89: //ykey
          if (e.ctrlKey && !e.shiftKey && !e.altKey) {
            this.toolstack.redo();
            window.redraw_all();
          }
          break;
          
        default:
          return this.editor.on_keydown(e);
      }
    }
  }
  
  function start() {
    var canvas3d = document.getElementById("canvas");
    var gl = webgl.init_webgl(canvas3d, {
      stencil : true,
      antialias : false
    });
    
    window._appstate = new AppState(gl, canvas3d);
    
    var canvas = document.getElementById("canvas2d");
    _appstate.pushModal(canvas, true);
    
    var animreq = undefined;
    function dodraw() {
      animreq = undefined;
      _appstate.draw();
    }
    
    window.redraw_all = function redraw_all() {
      if (animreq !== undefined) {
        return;
      }
      
      animreq = requestAnimationFrame(dodraw);
    }
    
    if (STARTUP_FILE_NAME in localStorage) {
      if (!_appstate.load()) {
        _appstate.popModal(canvas, this);
        
        window._appstate = new AppState(_appstate.gl, _appstate.canvas);
        _appstate.pushModal(canvas, true);
        
        //make base file
        _appstate.toolstack.execTool(new mesh_tools.CreateDefaultFile());
        
        console.log("started!");
        window.redraw_all();
      }
    } else {
      //make base file
      _appstate.toolstack.execTool(new mesh_tools.CreateDefaultFile());
      console.log("started!");
      window.redraw_all();
    }
    
    window.setInterval(function() {
      _appstate.on_tick();
    }, 250);
  }

  start();
  
  return exports;
});
