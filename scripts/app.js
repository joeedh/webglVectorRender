var _app = undefined; //for debugging purposes only.  don't write code with it
let SVG_URL = "http://www.w3.org/2000/svg";

define([
  "util", "mesh", "mesh_tools", "mesh_editor", "const", "simple_toolsys",
  "transform", "events", "config", "ui", "image", "curve", "webgl", "fbo", "vectormath"
], function(util, mesh, mesh_tools, mesh_editor, cconst, toolsys,
            transform, events, config, ui, image, curve, webgl, fbo, vectormath)
{
  'use strict';
  
  var exports = _app = {};

  let Vector2 = vectormath.Vector2;
  let Vector4 = vectormath.Vector4;

  window.STARTUP_FILE_NAME = "startup_file_rs32";

  window._config = config;

  function css2color(s) {
    let ret = new Vector4();
    ret[3] = 1.0;

    if (s.startsWith("#")) {
      s = s.slice(1, s.length).trim();
      let r=0, g=0, b=0, a=1.0;

      switch (s.length) {
        case 4:
        case 3:
          r = parseInt(s[0], 16) / 15;
          g = parseInt(s[1], 16) / 15;
          b = parseInt(s[2], 16) / 15;

          if (s.length == 4) {
            a = parseInt(s[3], 16) / 15;
          }
          break;
        case 8:
        case 6:
          r = parseInt(s.slice(0, 2), 16)/255;
          g = parseInt(s.slice(2, 4), 16)/255;
          b = parseInt(s.slice(4, 6), 16)/255;
          if (s.length == 8) {
            a = parseInt(s.slice(6, 8), 16)/255;
          }
          break;
      }

      ret[0] = r;
      ret[1] = g;
      ret[2] = b;
      ret[3] = a;
    } else if (s.startsWith("rgb")) {
      let r,g,b, a=1.0;

      let ret2 = s;

      let has_a = ret2.startsWith("rgba");
      ret2 = ret2.slice(ret2.search("\\(")+1, ret2.search("\\)"));

      ret2 = ret2.replace(/[ \t]/g, "").split(",");
      r = parseInt(ret2[0])/255;
      g = parseInt(ret2[1])/255;
      b = parseInt(ret2[2])/255;

      if (has_a) {
        a = parseFloat(ret2[3]);
      }

      ret[0] = r;
      ret[1] = g;
      ret[2] = b;
      ret[3] = a;
    }

    return ret;
  }
  window.css2color = css2color;

  var AppState = exports.AppState = class AppState extends events.EventHandler {
    constructor(gl, canvas) {
      super();
      
      this.fps = new Array(4);
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
      this.editor.ctx = this.ctx;
      
      this.pmesh = new curve.PathMesh();

      //this.loadTiger();
      this.makeGUI();
      this.image = undefined;
    }

    loadTiger() {
      let mesh1 = this.mesh = new mesh.Mesh();

      let svg = document.getElementById("tiger");
      let g = svg.children[0];

      let isFloat = (f) => {
        if (typeof f === "number")
          return true;

        f = f.trim();

        return f.search(/[\-\+]?\d*(\.)?\d+$/) === 0;
      }

      let vs = [];
      let lastv, startv, lastv2;

      let debug = 0;



      function moveTo(x, y, rel=false) {
        lastv2 = lastv;
        let v = startv = mesh1.makeVertex([x, y, 0]);

        vs.push(startv);

        if (rel && lastv) {
          v.add(lastv);
        }

        lastv = v;
      }

      function lineTo(x, y, rel=false) {
        if (isNaN(x) || isNaN(y)) {
          throw new Error("nan!");
        }
        lastv2 = lastv;
        let v = mesh1.makeVertex([x, y, 0]);

        if (rel && lastv) {
          v.add(lastv);
        }

        vs.push(v);

        let e = mesh1.makeEdge(lastv, v);
        lastv = v;

        return e;
      }

      function cubicTo(x1, y1, x2, y2, x3, y3, rel=false) {
        consolelog(x1, y1, x2, y2, x3, y3, rel);
        let e = lineTo(x3, y3, rel);

        e.h1[0] = x1;
        e.h1[1] = y1;

        e.h2[0] = x2;
        e.h2[1] = y2;

        if (rel) {
          e.h1.add(e.v1);
          e.h2.add(e.v2);
        }
      }


      /*
       on factor;
       off period;

       fx := cx + cos(start + th*s)*rx;
       fy := cy + sin(start + th*s)*ry;

       clear x0;
       clear y0;
       clear x1;
       clear y1;

       x0 := 0;
       y0 := 0;

       f1 := sub(s=0, fx) - x0;
       f2 := sub(s=0, fy) - y0;
       f3 := sub(s=1, fx) - x1;
       f4 := sub(s=1, fy) - y1;

       ff := solve({f1, f2, f3, f4}, {th, cx, cy, start});

       on fort;
       fth1 := part(ff, 1, 1, 2);
       fcx1 := part(ff, 1, 2, 2);
       fcy1 := part(ff, 1, 3, 2);
       fstart1 := part(ff, 1, 4, 2);

       fth2 := part(ff, 2, 1, 2);
       fcx2 := part(ff, 2, 2, 2);
       fcy2 := part(ff, 2, 3, 2);
       fstart2 := part(ff, 2, 4, 2);
       off fort;

      */
      let cos = Math.cos, sin = Math.sin, pi = Math.PI;
      let pow = Math.pow, asin = Math.asin, sign = Math.sign;
      let start1, cx1, cy1, th1;
      let start2, cx2, cy2, th2;
      let start3, cx3, cy3, th3;
      let start4, cx4, cy4, th4;
      let start, cx, cy, th;

      function acos(f) {
        let eps = 0.000001;

        let sign = Math.sign(f);
        f = Math.abs(f)*(1.0 - eps*2.0) + eps;

        return Math.acos(f*sign);
      }

      function sqrt(f) {
        return Math.sqrt(f);
      }

      function arcTo(rx, ry, xrot, flag1, flag2, x1, y1, rel) {
        if (!rel) { //force relative
          x1 -= lastv[0];
          y1 -= lastv[1];
        }

        consolelog(lastv[0], lastv[1]);
        consolelog(rx, ry, x1, y1);

        let rx2 = rx*Math.cos(xrot) + ry*Math.sin(xrot);
        let ry2 = ry*Math.cos(xrot) - rx*Math.sin(xrot);
        rx = rx2;
        ry = ry2;

        let th, cx, cy, start;

        //arc starts at lastv

        start1=(acos(((rx**2*y1**2+ry**2*x1**2)*ry*x1-sqrt(2*(2*ry**2-
            y1**2)*rx**2*ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4
            *x1**4)*rx*y1)/(2*(rx**2*y1**2+ry**2*x1**2)*rx*ry))-pi)*sign((
            (rx**2*y1**2+ry**2*x1**2)*rx*y1+sqrt(2*(2*ry**2-y1**2)*rx**2*
            ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4*x1**4)*ry*x1
            )/(2*(rx**2*y1**2+ry**2*x1**2)*rx*ry));

        cy1 = ((rx**2*y1**2+ry**2*x1**2)*rx*y1+sqrt(2*(2*ry**2-y1**2)*rx
           **2*ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4*x1**4)*
           ry*x1)/(2*(rx**2*y1**2+ry**2*x1**2)*rx);

        cx1=((rx**2*y1**2+ry**2*x1**2)*ry*x1-sqrt(2*(2*ry**2-y1**2)*rx
           **2*ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4*x1**4)*
           rx*y1)/(2*(rx**2*y1**2+ry**2*x1**2)*ry);

        th1 = acos(((2*ry**2-y1**2)*rx**2-ry**2*x1**2)/(2*rx**2*ry**2))*
        sign(sqrt(2*(2*ry**2-y1**2)*rx**2*ry**2*x1**2+(2*ry+y1)*(2*ry-
            y1)*rx**4*y1**2-ry**4*x1**4));


        start2=-(acos(((rx**2*y1**2+ry**2*x1**2)*ry*x1+sqrt(2*(2*ry**2
           -y1**2)*rx**2*ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4
           *x1**4)*rx*y1)/(2*(rx**2*y1**2+ry**2*x1**2)*rx*ry))-pi)*sign(
           (-((rx**2*y1**2+ry**2*x1**2)*rx*y1-sqrt(2*(2*ry**2-y1**2)*rx**2
             *ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4*x1**4)*ry*x1)) /
          (2*(rx**2*y1**2+ry**2*x1**2)*rx*ry));

        cy2=((rx**2*y1**2+ry**2*x1**2)*rx*y1-sqrt(2*(2*ry**2-y1**2)*rx**2
          *ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4*x1**4)*
           ry*x1)/(2*(rx**2*y1**2+ry**2*x1**2)*rx);

        cx2 = ((rx**2*y1**2+ry**2*x1**2)*ry*x1+sqrt(2*(2*ry**2-y1**2)*rx**
                  2*ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4*x1**4)*
                  rx*y1)/(2*(rx**2*y1**2+ry**2*x1**2)*ry);

        th2 = -acos(((2*ry**2-y1**2)*rx**2-ry**2*x1**2)/(2*rx**2*ry**2))
                     *sign(sqrt(2*(2*ry**2-y1**2)*rx**2*ry**2*x1**2+(2*ry+y1)*(2*ry
                      -y1)*rx**4*y1**2-ry**4*x1**4));


        //arc starts at x1/y1
        x1 = -x1;
        y1 = -y1;

        start3=(acos(((rx**2*y1**2+ry**2*x1**2)*ry*x1-sqrt(2*(2*ry**2-
          y1**2)*rx**2*ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4
          *x1**4)*rx*y1)/(2*(rx**2*y1**2+ry**2*x1**2)*rx*ry))-pi)*sign((
          (rx**2*y1**2+ry**2*x1**2)*rx*y1+sqrt(2*(2*ry**2-y1**2)*rx**2*
            ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4*x1**4)*ry*x1
        )/(2*(rx**2*y1**2+ry**2*x1**2)*rx*ry));

        cy3 = ((rx**2*y1**2+ry**2*x1**2)*rx*y1+sqrt(2*(2*ry**2-y1**2)*rx
          **2*ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4*x1**4)*
          ry*x1)/(2*(rx**2*y1**2+ry**2*x1**2)*rx);

        cx3=((rx**2*y1**2+ry**2*x1**2)*ry*x1-sqrt(2*(2*ry**2-y1**2)*rx
          **2*ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4*x1**4)*
          rx*y1)/(2*(rx**2*y1**2+ry**2*x1**2)*ry);

        th3 = acos(((2*ry**2-y1**2)*rx**2-ry**2*x1**2)/(2*rx**2*ry**2))*
          sign(sqrt(2*(2*ry**2-y1**2)*rx**2*ry**2*x1**2+(2*ry+y1)*(2*ry-
            y1)*rx**4*y1**2-ry**4*x1**4));


        start4=-(acos(((rx**2*y1**2+ry**2*x1**2)*ry*x1+sqrt(2*(2*ry**2
          -y1**2)*rx**2*ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4
          *x1**4)*rx*y1)/(2*(rx**2*y1**2+ry**2*x1**2)*rx*ry))-pi)*sign(
          (-((rx**2*y1**2+ry**2*x1**2)*rx*y1-sqrt(2*(2*ry**2-y1**2)*rx**2
            *ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4*x1**4)*ry*x1)) /
          (2*(rx**2*y1**2+ry**2*x1**2)*rx*ry));

        cy4=((rx**2*y1**2+ry**2*x1**2)*rx*y1-sqrt(2*(2*ry**2-y1**2)*rx**2
          *ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4*x1**4)*
          ry*x1)/(2*(rx**2*y1**2+ry**2*x1**2)*rx);

        cx4 = ((rx**2*y1**2+ry**2*x1**2)*ry*x1+sqrt(2*(2*ry**2-y1**2)*rx**
          2*ry**2*x1**2+(2*ry+y1)*(2*ry-y1)*rx**4*y1**2-ry**4*x1**4)*
          rx*y1)/(2*(rx**2*y1**2+ry**2*x1**2)*ry);

        th4 = -acos(((2*ry**2-y1**2)*rx**2-ry**2*x1**2)/(2*rx**2*ry**2))
          *sign(sqrt(2*(2*ry**2-y1**2)*rx**2*ry**2*x1**2+(2*ry+y1)*(2*ry
            -y1)*rx**4*y1**2-ry**4*x1**4));

        if (flag2) {
          let side = Math.abs(th1) < Math.abs(th2);
          side = side ^ flag1;

          if (side && isNaN(start2+cx2+cy2+th2))
            side = 0;
          else if (!side && isNaN(start1+cx1+cy1+th1))
            side = 1;

          if (side) {
            start = start2; cx = cx2; cy = cy2; th = th2;
          } else {
            start = start1; cx = cx1; cy = cy1; th = th1;
          }
        } else {
          let side = Math.abs(th1) < Math.abs(th2);
          side = side ^ flag1;

          if (side && isNaN(start4+cx4+cy4+th4))
            side = 0;
          else if (!side && isNaN(start3+cx3+cy3+th3))
            side = 1;

          if (side) {
            start = start4; cx = cx4; cy = cy4; th = th4;
          } else {
            start = start3; cx = cx3; cy = cy3; th = th3;
          }
        }


        consolelog(rx, ry, x1, y1);
        consolelog(start, cx, cy, th);

        let steps = 16;
        let ds = 1.0 / (steps - 1), s = 0.0;

        if (!flag2) {
          moveTo(x1, y1, true);
        }

        for (let i=0; i<steps; i++, s += ds) {
          let th2 = start + th*s;

          let x = cx + Math.cos(th2)*rx;
          let y = cy + Math.cos(th2)*ry;

          lineTo(x, y, true);
        }
      }


      let fillColor = new Vector4([0,0,0, 1]);

      function closePath() {
        let f = mesh1.makeFace(vs);
        f.fillColor.load(fillColor);
        vs = [];
      }

      window.isFloat = isFloat;
      //console.log(g)

      function consolelog() {
        if (debug) {
          console.log(...arguments);
        }
      }

      for (let child of g.children) {
        //console.log(child.tagName);
        if (child.tagName.toUpperCase() === "PATH") {
          let fill = child.getAttribute("fill");
          if (fill) {
            fillColor.load(css2color(fill));
          }

          let path = child.getAttribute("d");

          consolelog(path);

          //*
          //split commands
          path = path.replace(/([a-zA-Z])(\d|\.|\+|\-)/g, "$1 $2");
          path = path.replace(/(\d|\.)([a-zA-Z])/g, "$1 $2");

          //split numbers
          path = path.replace(/(\.)(\d+)(\.)(\d+)/g, "$1$2 $3$4");
          path = path.replace(/\.(\d+)\.(\d+)/g, ".$1 .$2");
          path = path.replace(/(\d)([\-\+,])(\d|\.)/g, "$1 $2$3");
          path = path.replace(/(\d)\-(\d)/g, "$1 -$2");
          //*/

          path = path.replace(/zm/g, "z m");
          path = path.replace(/zM/g, "z M");
          path = path.replace(/[ \t]+/g, " ").split(" ");
          //path = path.split(" ");

          for (let i=0; i<path.length; i++) {
            if (isFloat(path[i])) {
              path[i] = parseFloat(path[i]);
            }
          }

          consolelog(path);

          let i = 0;
          while (i < path.length) {
            let cmd = path[i];

            consolelog(cmd);
            let rel = cmd === cmd.toLowerCase();

            cmd = cmd.toLowerCase();

            i++;

            if (cmd === "m") {
              let i2 = i;
              moveTo(path[i++], path[i++], rel);

              while (isFloat(path[i])) {
                lineTo(path[i++], path[i++], rel);
              }

              if (i === i2) {
                i++;
              }

              continue;
            } else if (cmd === "l") {
              let i2 = i;

              while (isFloat(path[i])) {
                lineTo(path[i++], path[i++], rel);
              }

              if (i === i2) {
                i++;
              }
              continue;
            } else if (cmd === "c") {
              let i2 = i;

              while (i < path.length && isFloat(path[i])) {
                cubicTo(path[i++],path[i++], path[i++],path[i++], path[i++],path[i++], rel)
              }

              if (i2 === i) {
                i++;
              }

              continue;
            } else if (cmd === "a") {
              let i2 = i;
              while (i < path.length && isFloat(path[i])) {
                arcTo(path[i++],path[i++], path[i++], path[i++],path[i++], path[i++],path[i++], rel);
              }

              if (i === i2) {
                i++;
              }

              continue;
            } else if (cmd === "s") {
              let x, y;
              let i2 = i;

              while (i < path.length && isFloat(path[i])) {
                consolelog(i, path[i]);
                consolelog(i, path[i+1]);
                consolelog(i, path[i+2]);
                consolelog(i, path[i+3]);

                if (lastv && lastv2) {
                  x = lastv[0] - lastv2[0];
                  y = lastv[1] - lastv2[1];
                } else if (lastv) {
                  x = lastv[0];
                  y = lastv[1];
                } else {
                  x = y = 0;
                }


                cubicTo(x, y, path[i++],path[i++], path[i++],path[i++], rel);
              }

              if (i2 === i) {
                i++;
              }
              continue;
            } else if (cmd === "z") {
              if (startv.vectorDistance(lastv) > 0) {
                lineTo(startv[0], startv[1]);
              }
              closePath();
              continue;
            }


            i++;
          }

          consolelog(path);
        }
      }

      for (let v of mesh1.verts) {
        v.mulScalar(2.0);
        v[2] = 0.0;
        if (isNaN(v.dot(v))) {
          throw new Error("nan!");
          v.zero();
        }
      }
      for (let h of mesh1.handles) {
        h.mulScalar(2.0);
        h[2] = 0.0;
        if (isNaN(h.dot(h))) {
          throw new Error("nan!");
          h.zero();
        }
      }

      this.regen();
      if (window.redraw_all) {
        window.redraw_all();
      }
    }
    
    makeGUI() {
      this.gui = new ui.UI(STARTUP_FILE_NAME+"_gui1", config);
      this.gui.slider("BLUR", "Blur", 0, 0, 64, true, false);
      this.gui.slider("DISTBLUR", "DistBlur", 0, 0, 256, true, false);

      this.gui.check("DRAW_ELEMENTS", "Draw Elements");
      this.gui.check("DRAW_MASK_BUFFERS", "Draw Mask Buffers");
      this.gui.check("ENABLE_MASK", "Enable Mask");

      this.gui.button("clear", "Clear", () => {
        this.mesh = new mesh.Mesh();
        this.regen();
        window.redraw_all();
      });

      this.gui.button("load_tiger", "Load Tiger", () => {
        this.loadTiger();
      });

      /*
      this.gui.button("load_image", "Load Image", () => {
        console.log("load image!");
        image.loadImageFile().then((imagedata) => {
          console.log("got image!", imagedata);
          
          this.image = imagedata;
          window.redraw_all();
        });
      });//*/
      
      this.gui.load();
    }
    
    setsize() {
      var w = window.innerWidth, h = window.innerHeight;

      let dpi = devicePixelRatio;

      w = ~~(w*dpi);
      h = ~~(h*dpi);

      var eventfire = this.canvas2d.width !== w || this.canvas2d.height !== h;
      
      if (this.canvas2d.width !== w) {
        this.canvas2d.width = w;
        this.canvas2d.height = h;
        
        if (this.canvas) {
          this.canvas.width = w;
          this.canvas.height = h;

          this.canvas.style["width"] = (w/dpi) + "px";
          this.canvas.style["height"] = (h/dpi) + "px";
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
        if (this.fps[i] !== undefined) {
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

      /*
      on factor;

      procedure bez(a, b);
        a + (b - a)*s;

      lin := bez(k1, k2);
      quad := bez(lin, sub(k2=k3, k1=k2, lin));
      cubic := bez(quad, sub(k3=k4, k2=k3, k1=k2, quad));

      on fort;

      f   := sub(k1=0.0, cubic);
      dv1 := sub(k1=0.0, df(cubic, s));
      dv2 := sub(k1=0.0, df(cubic, s, 2));

      off fort;

      f1 := sub(s=0, df(quad, s)) - goal1;
      f2 := sub(s=1, df(quad, s)) - goal2;

      f1 := solve(f1, k2);
      f2 := solve(f2, k2);

      f1 := part(f1, 1, 2);
      f2 := part(f2, 1, 2);

      ff := (f1+f2)*0.5;

      */

      function cubic(k2, k3, k4, s) {
        return -((3.0*(s-1.0)*k3-k4*s)*s-3.0*(s-1.0)**2*k2)*s
      }
      function dcubic(k2, k3, k4, s) {
        return -3.0*(((3.0*s-2.0)*k3-k4*s)*s-(3.0*s-1.0)*(s-1.0)*k2);
      }
      function d2cubic(k2, k3, k4, s) {
        return -6.0*((3.0*s-1.0)*k3-k4*s-(3.0*s-2.0)*k2);
      }

      let canvas = this.canvas;

      let vscache = util.cachering.fromConstructor(Vector2, 512);
      let vscache2 = util.cachering.fromConstructor(Vector2, 512);
      let mpt = new Vector2();

      function dcubic2(h1, h2, v2, s) {
        let p = vscache2.next().zero();

        p[0] = dcubic(h1[0], h2[0], v2[0], s);
        p[1] = dcubic(h1[1], h2[1], v2[1], s);

        return p;
      }


      function cubic2(h1, h2, v2, s) {
        let p = vscache2.next().zero();

        p[0] = cubic(h1[0], h2[0], v2[0], s);
        p[1] = cubic(h1[1], h2[1], v2[1], s);

        return p;
      }

      function makepoint(path, p, start) {
        p = mpt.load(p)
        if (start)
          p.add(start);
        p[1] = canvas.height - p[1];

        return path.make_point(p);
      }
      function makeCubic(v1, h1, h2, v2, path) {
        v1 = vscache.next().load(v1);
        v2 = vscache.next().load(v2);
        h1 = vscache.next().load(h1);
        h2 = vscache.next().load(h2);
        let tmp = vscache.next();

        v2.sub(v1); h1.sub(v1); h2.sub(v1);
        let arc = h1.vectorLength() + h2.vectorDistance(h1) + v2.vectorDistance(h2);

        let steps=2;

        if (arc > 400) {
          steps += 2;
        } else if (arc > 200) {
          steps += 2;
        }

        let s=0, ds = 1.0 / steps;

        //steps = Math.max(~~(arc/300.0), 2.0);
        //console.log(steps);

        for (let i=0; i<steps; i++, s += ds) {
          let a = cubic2(h1, h2, v2, s);
          let da = dcubic2(h1, h2, v2, s);

          let b = cubic2(h1, h2, v2, s+ds);
          let db = dcubic2(h1, h2, v2, s+ds);

          //da.zero(); db.zero();

          da.mulScalar(ds);
          db.mulScalar(ds);
          //da.mulScalar(0.33);
          //db.mulScalar(0.33);

          let dx = (2.0*(a[0]+b[0])-db[0]+da[0])/4.0;
          let dy = (2.0*(a[1]+b[1])-db[1]+da[1])/4.0;

          //dx = (da[0]+2.0*a[0])/2.0;
          //dy = (da[1]+2.0*a[1])/2.0;

          tmp[0] = dx;
          tmp[1] = dy;

          makepoint(path, a, v1);
          makepoint(path, tmp, v1);
        }

      }
      this.pmesh.reset(this.gl);

      let mesh = this.mesh;
      for (let f of mesh.faces) {
        let path = this.pmesh.make_path();
        path.fillcolor.load(f.fillColor);

        for (let list of f.lists) {
          for (let l of list) {
            let h = l.e.h1;

            let v1 = l.v, v2 = l.next.v;
            let h1 = v1 === l.e.v1 ? l.e.h1 : l.e.h2;
            let h2 = v2 === l.e.v2 ? l.e.h2 : l.e.h1;

            makeCubic(v1, h1, h2, v2, path);
          }
        }

        f.blur = path.blur = config.BLUR;
        //path.blur = f.blur;
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
      //gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clearDepth(1.0);
      gl.clearStencil(0);
      
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      
      this.pmesh.draw(gl, this.canvas.width, this.canvas.height);

      if (config.DRAW_ELEMENTS) {
        this.editor.draw(this.ctx, this.canvas2d, this.g);
      }

      gl.clearColor(1, 1, 1, 1);
      gl.colorMask(0, 0, 0, 1);

      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.colorMask(1, 1, 1, 1);
      gl.flush();

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

      //console.warn("Force loading tiger!");
      //this.loadTiger();

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

      let blur = ~~config.BLUR;
      let update = false;

      for (let p of this.pmesh.paths) {
        update = p.blur !== blur;
        p.blur = blur;

        if (update) {
          p.recalc_aabb();
        }
      }

      if (update) {
        this.regen();
        window.redraw_all();
      }
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

  window.setTimeout(() => {
    _appstate.regen();
    _appstate.pmesh.regen_render();
    window.redraw_all();
  }, 500);

  start();
  
  return exports;
});
