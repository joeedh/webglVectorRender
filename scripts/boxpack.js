"use strict";

let _boxpack = undefined;

define([
  "util", "vectormath", "math", "solver"
], function(util, vectormath, math, solver) {
  let exports = _boxpack = {};

  let Constraint = solver.Constraint;
  let Solver = solver.Solver;
  let Vector2 = vectormath.Vector2;

  let Box = exports.Box = class Box {
    constructor() {
      this.pos = new Vector2([0, 0]);
      this.size = new Vector2([32, 32]);
      this.visible = 0;
      this.old = new Vector2();
      this.vel = new Vector2();

      this.pos2 = new Vector2();
      this.size2 = new Vector2();
      this.margin = 2;
    }
  }

  let BoxPacker = exports.BoxPacker = class BoxPacker {
    constructor() {
      this.boxes = [];
      this.random = new util.MersenneRandom();
    }

    add(box) {
      this.boxes.push(box);
    }

    solve() {
      //return this.solverTimer();
      let boxes = this.boxes;
      let err = 0.0;

      for (let i=0; i<250; i++) {
        for (let b1 of boxes) {
          b1.visible = true;
          b1.old.load(b1.pos);
          //b1.pos.addFac(b1.vel, 0.0);
        }

        err = this.solveStep();

        if (i > 5 && Math.abs(err) < 0.0001) {
          break;
        }

        for (let b1 of boxes) {
          b1.vel.load(b1.pos).sub(b1.old);
        }
        let min = new Vector2([1e17, 1e17]);

        for (let b of boxes) {
          min.min(b.pos);
        }

        for (let b of boxes) {
          b.pos.sub(min);
        }
      }

      console.log("error", err);
    }

    solveTimer() {
      let boxes = this.boxes;

      for (let b1 of boxes) {
        let rfac = 250.0;
        //b1.pos[0] += Math.random() * rfac;
        //b1.pos[1] += Math.random() * rfac;
      }

      let i = 0;

      this.timer = window.setInterval(() => {
        let time = util.time_ms();

        while (util.time_ms() - time < 200) {
          for (let b1 of boxes) {
            b1.visible = true;
            //b1.vel[0] += (Math.random()-0.5);
            //b1.vel[1] += (Math.random()-0.5);
            b1.old.load(b1.pos);
            //b1.pos.addFac(b1.vel, 0.0);
          }

          let err = this.solveStep();
          i++;

          if (i > 5 && Math.abs(err) < 0.0001) {
            clearInterval(this.timer);
            this.timer = undefined;
            window.redraw_all();
          }

          for (let b1 of boxes) {
            b1.vel.load(b1.pos).sub(b1.old);
          }
          let min = new Vector2([1e17, 1e17]);

          for (let b of boxes) {
            min.min(b.pos);
          }

          for (let b of boxes) {
            b.pos.sub(min);
          }

        }
        window.redraw_all();
      }, 55);

    }

    solveStep() {
      let boxes = this.boxes;

      function box_c(params) {
        let [b1, b2] = params;

        b1.pos2.load(b1.pos).subScalar(b1.margin);
        b1.size2.load(b1.size).addScalar(b1.margin*2.0);
        b2.pos2.load(b2.pos).subScalar(b2.margin);
        b2.size2.load(b2.size).addScalar(b2.margin*2.0);

        let area = math.aabb_overlap_area(b1.pos2, b1.size2, b2.pos2, b2.size2);
        return area;
      }

      let slv = new Solver();

      let v1 = new Vector2();
      let v2 = new Vector2();
      let s1 = new Vector2();
      let s2 = new Vector2();

      let clamp = (b) => {
        let x = Math.min(Math.max(b.pos[0], 0), this.size[0] - b.size[0]);
        let y = Math.min(Math.max(b.pos[1], 0), this.size[1] - b.size[1]);
        let dx = x - b.pos[0];
        let dy = y - b.pos[1];

        let fac = 0.5;

        b.pos[0] += dx*fac;
        b.pos[1] += dy*fac;
      }

      let isect = false;

      let clamp_c = (params) => {
        let b = params[0];

        let min = Math.min, max = Math.max;

        let x = min(max(b.pos[0], 0), this.size[0]-b.size[0]);
        let y = min(max(b.pos[1], 1), this.size[1]-b.size[1]);

        let dx = x - b.pos[0];
        let dy = y - b.pos[1];

        dx = Math.abs(dx);
        dy = Math.abs(dy);

        //return Math.sqrt(dx*dy);
        //return Math.max(dx, dy);
        //return dy;
        return Math.sqrt(dx*dx + dy*dy);
      }

      for (let b1 of boxes) {
        let rfac = 0.05;
        b1.pos[0] += (this.random.random()-0.5) * rfac;
        b1.pos[1] += (this.random.random()-0.5) * rfac;
      }
      //for (let b1 of boxes) {
      for (let i=0; i<boxes.length; i++) {
        let ri = ~~(this.random.random()*boxes.length*0.99999);
        let b1 = boxes[ri];

        let con = new Constraint("clamp_c", clamp_c, [b1.pos], [b1]);
        //con.k = 0.25;
        //slv.add(con);

        let dx = b1.pos[0] > this.size[0]*0.5 ? -1 : 1;
        let dy = b1.pos[1] > this.size[1]*0.5 ? -1 : 1;

        b1.pos[0] += dx*0.5;
        b1.pos[1] += dy*0.5;

        for (let b2 of boxes) {
          if (b1 === b2) continue;

          v1.load(b1.pos).addFac(b1.size, 0.5);
          v2.load(b2.pos).addFac(b2.size, 0.5);

          let dis = v1.vectorDistance(v2);
          //dis = Math.abs(v1[0]-v2[0])*0.5 + Math.abs(v1[1]-v2[1])*0.5;
          let dx = Math.abs(v1[0]-v2[0]);
          let dy = Math.abs(v1[1]-v2[1]);

          dis = Math.max(dx, dy);
          //dis = Math.max(Math.abs(v1[0]-v2[0]), Math.abs(v1[1]-v2[1]));

          let r1 = s1.load(b1.size).vectorLength();
          let r2 = s2.load(b2.size).vectorLength();

          if (dx > dy) {
            r1 = b1.size[0];
            r2 = b2.size[0];
          } else {
            r1 = b1.size[1];
            r2 = b2.size[1];
          }

          let r = (r1 + r2)/1.4;

          v1.sub(v2);
          if (dx < dy) {
            v1[0] = 0.0;
          } else {
            v1[1] = 0.0;
          }

          if (dis < r) {
            let w = 1.0 - dis/r;
            w = Math.pow(w, 5.0);

            //b1.pos.addFac(v1, w);
            //b2.pos.addFac(v1, -w);
          } else {
            r *= 2.0;

            let w = -(dis-r)/r;
            w = w*w*w*0.1;

            //b1.pos.addFac(v1, w);
          }

          if (math.aabb_isect_2d(b1.pos, b1.size, b2.pos, b2.size)) {
            isect = true;
            let con = new Constraint("box_c", box_c, [b1.pos, b2.pos], [b1, b2]);
            slv.add(con);
            //con.k = 0.1;
          }
        }
      }

      let err = slv.solve(10, 0.9);
      //if (Math.random() > 0.99) {
      //console.log("error:", err.toFixed(4));
      //}

      return err + isect;
    }

    pack(scale = 1.15, g) {
      let totarea = 0;
      let maxw = 0, maxh = 0;

      for (let b of this.boxes) {
        maxw = Math.max(b.size[0], maxw);
        maxh = Math.max(b.size[1], maxh);

        totarea += (b.size[0] + 1) * (b.size[1] + 1);
      }

      let dimen = Math.ceil(Math.sqrt(totarea));

      dimen = ~~Math.max(dimen, maxw);
      let dimenw = dimen;
      let dimenh = totarea / dimenw;

      dimenh = ~~Math.max(dimenh, maxh);

      dimenw = ~~(dimenw * scale);
      dimenh = ~~(dimenh * scale);

      this.size = new Vector2([dimenw, dimenh]);

      for (let b of this.boxes) {
        b.pos[0] = this.random.random()*(dimenw - b.size[0]);
        b.pos[1] = this.random.random()*(dimenh - b.size[1]);
      }

      console.log("dimen", dimenw, dimenh);
      this.dimen = dimen;

      let bs1 = this.boxes.concat([]);
      let bs2 = this.boxes.concat([]);

      this.boxes.sort((a, b) => {
        return -(a.size[0] * a.size[1] - b.size[0] * b.size[1]);
      });

      bs1.sort((a, b) => b.size[0] - a.size[0]);
      bs2.sort((a, b) => b.size[1] - a.size[1]);

      let cur = 0;

      //dimenw *= 0.5
      //dimenh *= 0.5;
      let bound = [0, 0, dimenw, dimenh];

      if (g) g.strokeStyle = "red";

      let queue = [];
      let queue2 = [];

      let boxes = this.boxes.concat([]);

      let split = (x, y, w, h, depth = 0) => {
        if (depth > 40) {
          queue.push(x, y, w, h);
          return;
        }

        let b;
        //let boxes = w > h ? bs1 : bs2;

        b = boxes[0];
        if (!b) return;

        for (let q of queue) {
          if (0 && b.size[0] < q[2] && b.size[1] < q[3]) {
            b.visible = true;
            b.pos[0] = q[0];
            b.pos[1] = q[1];

            queue.remove(q);

            split(x, y, w, h, depth + 1);
            return;
          }
        }

        if (b.size[0] > w || b.size[1] > h) {
          bs1.remove(b);
          bs2.remove(b);
          boxes.remove(b);

          bs1.push(b);
          bs2.push(b);
          boxes.push(b);

          if (bs1.length > 0) {
            split(x, y, w, h, depth + 1);
          }
          return;
        } else {
          b.pos[0] = x;
          b.visible = true;

          b.pos[1] = y;
          bs1.remove(b);
          bs2.remove(b);
          boxes.remove(b);
        }


        let w2 = Math.max(b.size[0], w / 2);
        let h2 = Math.max(b.size[1], h / 2);
        let x2 = x + w2, y2 = y + h2;

        if (g) {
          g.lineWidth = 1;

          g.strokeStyle = "red";
          g.beginPath();
          g.moveTo(x + w2, y);
          g.lineTo(x + w2, y + h);
          g.moveTo(x, y + h2);
          g.lineTo(x + w, y + h2);
          g.stroke();
        }

        let d = depth & 1;

        split(x2, y2, w - w2, h - h2, depth + 1);
        split(x, y2, w2, h - h2, depth + 1);
        split(x2, y, w - w2, h2, depth + 1);
        if (w2 > b.size[0] && h2 > b.size[1]) {
          split(x + b.size[0], y + b.size[1], w2 - b.size[0], h2 - b.size[1], depth + 1);
          split(x + b.size[0], y, w2 - b.size[0], b.size[1], depth + 1);
          split(x, y + b.size[1], b.size[0], h2 - b.size[1], depth + 1);
        }
      }

      split(0, 0, dimenw, dimenh);

      this.solve();

      let min = new Vector2([1e17, 1e17]);
      let max = new Vector2([-1e17, -1e17]);
      let v = new Vector2();

      for (let b of this.boxes) {
        min.min(b.pos);
        v.load(b.pos).add(b.size);

        max.max(v);
      }

      for (let b of this.boxes) {
        b.pos.sub(min);
      }

      this.size[0] = Math.ceil(max[0]-min[0]);
      this.size[1] = Math.ceil(max[1]-min[1]);
      console.warn("dimen", this.size);

      let count = 0;
      for (let b of this.boxes) {
        if (isNaN(b.pos[0]) || isNaN(b.pos[1])) {
          console.warn("NaN!");
          b.pos[0] = b.pos[1] = 0.0;
        }
        if (!b.visible)
          count++;
      }

      return count;
    }
  }

  return exports;
});
