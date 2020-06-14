let _solver = undefined;

define([
  "util", "vectormath", "math"
], function(util, vectormath, math) {
  "use strict";

  let exports = _solver = {};

  let Vector2 = vectormath.Vector2;

  let Constraint = exports.Constraint = class Constraint {
    constructor(name, func, klst, params, k = 1.0) {
      this.glst = [];
      this.klst = klst;
      this.k = k;
      this.params = params;
      this.name = name;

      for (let ks of klst) {
        this.glst.push(new Float64Array(ks.length));
      }

      this.df = 0.0005;
      this.threshold = 0.0001;
      this.func = func;
    }

    evaluate(no_dvs = false) {
      let r1 = this.func(this.params);

      if (Math.abs(r1) < this.threshold)
        return 0.0;

      let df = this.df;

      if (no_dvs)
        return r1;

      for (let i = 0; i < this.klst.length; i++) {
        let gs = this.glst[i];
        let ks = this.klst[i];

        for (let j = 0; j < ks.length; j++) {
          let orig = ks[j];
          ks[j] += df;
          let r2 = this.func(this.params);
          ks[j] = orig;

          gs[j] = (r2 - r1) / df;
        }
      }

      return r1;
    }
  }

  let Solver = exports.Solver = class Solver {
    constructor() {
      this.constraints = [];
      this.gk = 0.99;
    }

    add(con) {
      this.constraints.push(con);
    }

    solveStep(gk = this.gk) {
      let err = 0.0;

      for (let con of this.constraints) {
        let r1 = con.evaluate();

        if (r1 === 0.0)
          continue;

        err += Math.abs(r1);
        let totgs = 0.0;

        for (let i = 0; i < con.klst.length; i++) {
          let ks = con.klst[i], gs = con.glst[i];
          for (let j = 0; j < ks.length; j++) {
            totgs += gs[j] * gs[j];
          }
        }

        if (totgs === 0.0) {
          continue;
        }

        r1 /= totgs;

        for (let i = 0; i < con.klst.length; i++) {
          let ks = con.klst[i], gs = con.glst[i];
          for (let j = 0; j < ks.length; j++) {
            ks[j] += -r1 * gs[j] * con.k * gk;
          }
        }
      }

      return err;
    }

    solve(steps, gk = this.gk) {
      let err = 0.0;

      for (let i = 0; i < steps; i++) {
        err = this.solveStep(gk);

        if (err < 0.01 / this.constraints.length) {
          break;
        }
      }

      return err;
    }
  }

  return exports;
});
