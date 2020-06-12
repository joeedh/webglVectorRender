var _config = undefined;

define([
], function() {
  'use strict';
  
  var exports = _config = {};
  
  exports.BLUR = 128;
  exports.DRAW_ELEMENTS = true;
  exports.EXAMPLE_OPTION = false;
  
  exports.copy = function() {
    let ret = JSON.parse(JSON.stringify(this));
    
    ret.copy = this.copy;
    ret.loadJSON = this.loadJSON;
    ret.toJSON = this.toJSON;
    
    return ret;
  }
  
  exports.toJSON = function() {
    let ret = {};
    
    for (let k in this) {
      let v = this[k];
      
      if (typeof v != "function") {
        ret[k] = v;
      }
    }
    
    return ret;
  } 
  
  exports.loadJSON = function(obj) {
    for (let k in obj) {
      let v = obj[k];
      
      if (typeof v == "function" || (typeof v == "object" && v.is_new_curve)) {
        continue;
      }
      
      if (!(k in exports)) {
        console.log("unknown config key", k);
        continue;
      }
      
      this[k] = obj[k];
    }
    
    return this;
  }
  
  return exports;
});

/*
whale:

"{"version":0.0001,"mesh":{"eidgen":{"_cur":69},"verts":{"type":1,"array":[{"0":325,"1":167,"2":0,"type":1,"flag":0,"index":0,"eid":1,"edges":[6,65]},{"0":535,"1":386,"2":0,"type":1,"flag":0,"index":0,"eid":2,"edges":[8,53]},{"0":609,"1":568,"2":0,"type":1,"flag":0,"index":0,"eid":3,"edges":[10,57]},{"0":407,"1":577,"2":0,"type":1,"flag":0,"index":0,"eid":4,"edges":[12,61]},{"0":636.25,"1":168.25,"2":0,"type":1,"flag":0,"index":0,"eid":19,"edges":[21,37]},{"0":771.75,"1":431,"2":0,"type":1,"flag":0,"index":0,"eid":23,"edges":[25,41]},{"0":529,"1":583.75,"2":0,"type":1,"flag":0,"index":0,"eid":27,"edges":[29,45]},{"0":293,"1":441.5,"2":0,"type":1,"flag":0,"index":0,"eid":31,"edges":[33,49]},{"0":511.0625,"1":68.0625,"2":0,"type":1,"flag":0,"index":0,"eid":35,"edges":[37,6]},{"0":616.4375,"1":457,"2":0,"type":1,"flag":0,"index":0,"eid":39,"edges":[41,8]},{"0":571.75,"1":570.4375,"2":0,"type":1,"flag":0,"index":0,"eid":43,"edges":[45,10]},{"0":342.5,"1":520.375,"2":0,"type":1,"flag":0,"index":0,"eid":47,"edges":[49,12]},{"0":729.8125,"1":317.8125,"2":0,"type":1,"flag":1,"index":0,"eid":51,"edges":[53,21]},{"0":723.6875,"1":483.75,"2":0,"type":1,"flag":0,"index":0,"eid":55,"edges":[57,25]},{"0":439,"1":658.9375,"2":0,"type":1,"flag":0,"index":0,"eid":59,"edges":[61,29]},{"0":275.25,"1":304.375,"2":0,"type":1,"flag":0,"index":0,"eid":63,"edges":[65,33]},{"0":490,"1":475,"2":0,"type":1,"flag":0,"index":0,"eid":67,"edges":[]},{"0":811,"1":198,"2":0,"type":1,"flag":0,"index":0,"eid":68,"edges":[]}],"selected":[51],"active":-1,"highlight":-1},"edges":{"type":2,"array":[{"type":2,"flag":0,"index":0,"eid":6,"v1":1,"v2":35,"h":5,"l":15},{"type":2,"flag":0,"index":0,"eid":8,"v1":2,"v2":39,"h":7,"l":16},{"type":2,"flag":0,"index":0,"eid":10,"v1":3,"v2":43,"h":9,"l":17},{"type":2,"flag":0,"index":0,"eid":12,"v1":4,"v2":47,"h":11,"l":18},{"type":2,"flag":0,"index":0,"eid":21,"v1":19,"v2":51,"h":20,"l":22},{"type":2,"flag":0,"index":0,"eid":25,"v1":23,"v2":55,"h":24,"l":26},{"type":2,"flag":0,"index":0,"eid":29,"v1":27,"v2":59,"h":28,"l":30},{"type":2,"flag":0,"index":0,"eid":33,"v1":31,"v2":63,"h":32,"l":34},{"type":2,"flag":0,"index":0,"eid":37,"v1":35,"v2":19,"h":36,"l":38},{"type":2,"flag":0,"index":0,"eid":41,"v1":39,"v2":23,"h":40,"l":42},{"type":2,"flag":0,"index":0,"eid":45,"v1":43,"v2":27,"h":44,"l":46},{"type":2,"flag":0,"index":0,"eid":49,"v1":47,"v2":31,"h":48,"l":50},{"type":2,"flag":0,"index":0,"eid":53,"v1":51,"v2":2,"h":52,"l":54},{"type":2,"flag":0,"index":0,"eid":57,"v1":55,"v2":3,"h":56,"l":58},{"type":2,"flag":0,"index":0,"eid":61,"v1":59,"v2":4,"h":60,"l":62},{"type":2,"flag":0,"index":0,"eid":65,"v1":63,"v2":1,"h":64,"l":66}],"selected":[],"active":-1,"highlight":-1},"loops":{"type":8,"array":[{"v":1,"e":6,"f":13,"radial_next":15,"radial_prev":15,"next":38,"prev":66,"list":14,"type":8,"flag":0,"index":0,"eid":15},{"v":2,"e":8,"f":13,"radial_next":16,"radial_prev":16,"next":42,"prev":54,"list":14,"type":8,"flag":0,"index":0,"eid":16},{"v":3,"e":10,"f":13,"radial_next":17,"radial_prev":17,"next":46,"prev":58,"list":14,"type":8,"flag":0,"index":0,"eid":17},{"v":4,"e":12,"f":13,"radial_next":18,"radial_prev":18,"next":50,"prev":62,"list":14,"type":8,"flag":0,"index":0,"eid":18},{"v":19,"e":21,"f":13,"radial_next":22,"radial_prev":22,"next":54,"prev":38,"list":14,"type":8,"flag":0,"index":0,"eid":22},{"v":23,"e":25,"f":13,"radial_next":26,"radial_prev":26,"next":58,"prev":42,"list":14,"type":8,"flag":0,"index":0,"eid":26},{"v":27,"e":29,"f":13,"radial_next":30,"radial_prev":30,"next":62,"prev":46,"list":14,"type":8,"flag":0,"index":0,"eid":30},{"v":31,"e":33,"f":13,"radial_next":34,"radial_prev":34,"next":66,"prev":50,"list":14,"type":8,"flag":0,"index":0,"eid":34},{"v":35,"e":37,"f":13,"radial_next":38,"radial_prev":38,"next":22,"prev":15,"list":14,"type":8,"flag":0,"index":0,"eid":38},{"v":39,"e":41,"f":13,"radial_next":42,"radial_prev":42,"next":26,"prev":16,"list":14,"type":8,"flag":0,"index":0,"eid":42},{"v":43,"e":45,"f":13,"radial_next":46,"radial_prev":46,"next":30,"prev":17,"list":14,"type":8,"flag":0,"index":0,"eid":46},{"v":47,"e":49,"f":13,"radial_next":50,"radial_prev":50,"next":34,"prev":18,"list":14,"type":8,"flag":0,"index":0,"eid":50},{"v":51,"e":53,"f":13,"radial_next":54,"radial_prev":54,"next":16,"prev":22,"list":14,"type":8,"flag":0,"index":0,"eid":54},{"v":55,"e":57,"f":13,"radial_next":58,"radial_prev":58,"next":17,"prev":26,"list":14,"type":8,"flag":0,"index":0,"eid":58},{"v":59,"e":61,"f":13,"radial_next":62,"radial_prev":62,"next":18,"prev":30,"list":14,"type":8,"flag":0,"index":0,"eid":62},{"v":63,"e":65,"f":13,"radial_next":66,"radial_prev":66,"next":15,"prev":34,"list":14,"type":8,"flag":0,"index":0,"eid":66}],"selected":[],"active":-1,"highlight":-1},"lists":{"type":16,"array":[{"start":15,"end":18,"type":16,"flag":0,"index":0,"eid":14}],"selected":[],"active":-1,"highlight":-1},"faces":{"type":32,"array":[{"lists":[14],"blur":1,"type":32,"flag":0,"index":0,"eid":13}],"selected":[],"active":-1,"highlight":-1},"handles":{"type":4,"array":[{"0":381.5,"1":79,"owner":6,"type":4,"flag":0,"index":0,"eid":5},{"0":535.5,"1":452.5,"owner":8,"type":4,"flag":0,"index":0,"eid":7},{"0":581.5,"1":590.5,"owner":10,"type":4,"flag":0,"index":0,"eid":9},{"0":371,"1":554.25,"owner":12,"type":4,"flag":0,"index":0,"eid":11},{"0":739.375,"1":231.375,"owner":21,"type":4,"flag":0,"index":0,"eid":20},{"0":765.625,"1":460.5,"owner":25,"type":4,"flag":0,"index":0,"eid":24},{"0":469.5,"1":660.625,"owner":29,"type":4,"flag":0,"index":0,"eid":28},{"0":257.5,"1":368,"owner":33,"type":4,"flag":0,"index":0,"eid":32},{"0":695.625,"1":38.125,"owner":37,"type":4,"flag":0,"index":0,"eid":36},{"0":671.375,"1":461.5,"owner":41,"type":4,"flag":0,"index":0,"eid":40},{"0":553,"1":585.375,"owner":45,"type":4,"flag":0,"index":0,"eid":44},{"0":314,"1":486.5,"owner":49,"type":4,"flag":0,"index":0,"eid":48},{"0":564.25,"1":250.25,"owner":53,"type":4,"flag":0,"index":0,"eid":52},{"0":689.75,"1":544,"owner":57,"type":4,"flag":0,"index":0,"eid":56},{"0":408.5,"1":657.25,"owner":61,"type":4,"flag":0,"index":0,"eid":60},{"0":280,"1":210.75,"owner":65,"type":4,"flag":0,"index":0,"eid":64}],"selected":[],"active":20,"highlight":-1}},"config":{"BLUR":1,"EXAMPLE_OPTION":false}}"

*/