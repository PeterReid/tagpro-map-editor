$(function() {
  var importJson;
  var importPng;

  var maxZoom = 3;
  var zoom = maxZoom;
  var tileSize = 40;
  
  function positionCss(x, y) {
    return -x*tileSize + 'px ' + -y*tileSize + 'px';
  }
  function TileType(name, sheetX, sheetY, r,g,b, toolTipText, extra) {
    this.name = name;
    this.sheetX = sheetX;
    this.sheetY = sheetY;
    this.color = String.fromCharCode(r)+String.fromCharCode(g)+String.fromCharCode(b)+String.fromCharCode(255);
    this.postPlaceFn = extra&&extra.postPlaceFn;
    this.logicFn = extra&&extra.logicFn;
    this.image = extra&&extra.image;
    this.wallSolids = extra&&extra.wallSolids;
    this.rgb = r | (g<<8) | (b<<16);
    this.opposite = this; // What it switches to when mirrored
    this.toolTipText = toolTipText;
  }
  TileType.prototype.isWall = function() {
    return !!this.wallSolids;
  }
  TileType.prototype.positionCss = function() {
    return positionCss(this.sheetX, this.sheetY)
  }
  TileType.prototype.drawOn = function($elem, tile) {
    var styleBgColor = '';
    var styleUrl = 'url("' + (this.image || 'default-skin-v2') + '.png")';
    var styleBackgroundSize = this.image ? (5*tileSize+'px ' + tileSize + 'px') : (16*tileSize + 'px ' + 11*tileSize + 'px');
    if (this.name == 'empty') {
      styleBgColor = 'black';
      styleUrl = '';
    }
    if (styleBgColor != $elem.styleBgColor) {
      $elem.css('background-color', styleBgColor);
      $elem.styleBgColor = styleBgColor;
    }
    if (styleBackgroundSize != $elem.styleBackgroundSize) {
      $elem.css('background-size', styleBackgroundSize);
      $elem.styleBackgroundSize = styleBackgroundSize;
    }
    if (styleUrl != $elem.styleUrl) {
      $elem.css('background-image', styleUrl)
      $elem.styleUrl = styleUrl;
    }
    if (tile && tile.quadrantElems) {
      if (this.isWall()) {
        for (var q=0; q<4; q++) {
          var mask = (this.wallSolids >> (q<<1)) & 3;
          
          if (mask==0) {
            tile.quadrantElems[q].style.display='none';
          } else {
            var cx=0, cy=0;
            //var startLookingForOpeningClockwiseFrom = (q<<1) + (mask & 2;
            // There is a chip out of this quadrant's corner if it is solid and across from us, on the
            // same tile, is empty.
            var hasChip = mask==3 && (((this.wallSolids|(this.wallSolids<<8)) >> ((q+2)<<1))&3)==0;
            var first = [2,3,4,1][q]
            var solidStart = 2;
            var solidEnd = 2;
            if (mask==3) {
              solidStart = ((q+2)*2) % 8;
              solidEnd = ((q+3)*2) % 8;
            } else if (mask==1) {
              solidStart = ((q+2)*2+1) % 8;
              solidEnd = ((q+2)*2+2) % 8;
            } else if (mask==2) {
              solidStart = ((q+2)*2) % 8;
              solidEnd = ((q+2)*2+1) % 8;
            }
            
            solidStart = (solidStart+6)%8;
            solidEnd = (solidEnd+6)%8;
            var coords = quadrantCoords['1.'+first+''+solidStart+''+solidEnd + (hasChip?'d':'')];
            tile.quadrantElems[q].style.display='inline-block';
            tile.quadrantElems[q].style.backgroundPosition = positionCss(coords[0], coords[1]);
          }
        }
        var x = tile.x, y = tile.y;
        var idx = (isWall(x-1,y)?1:0) | (isWall(x+1,y)?2:0) | (isWall(x,y-1)?4:0) | (isWall(x,y+1)?8:0);
        var coords = [5.5,5.5]/*[
          [0,0], //
          [9,6], // L
          [8,6], // R
          [2,4], // LR
          [0,6], // U
          [6,8], // LU
          [2,8], // RU
          [4,8], // LRU
          [0,2],  // D
          [6,0], // LD
          [2,0], // RD
          [4,0], // LRD
          [4,1], // UD
          [7,4], // LUD
          [0,4], // RUD
          [4,4]  // LRUD
        ][idx];*/
        $elem.css('background-position', floorType.positionCss())
      } else {
        if (tile && tile.quadrantElems) {
          for (var q=0; q<4; q++) {
            tile.quadrantElems[q].style.display='none';
          }
        }
        $elem.css('background-position', this.positionCss())
      }
    } else {
      $elem.css('background-position', this.positionCss())
    }
    
  }


  function Tool(fns) {
    this.type = fns.type || '';
    this.down = fns.down || function() {};
    this.speculateDrag = fns.speculateDrag || function() {};
    this.speculateUp = fns.speculateUp || function() {};
    this.drag = fns.drag || function() {};
    this.up = fns.up || function() {};
    this.select = fns.select || function() {};
    this.unselect = fns.unselect || function() {};
    this.stateChange = fns.stateChange || function() {}; // arbitrary state change happened -- redraw tool state if necessary
    this.getState = fns.getState || function() {};
    this.setState = fns.setState || function() {};
  }
  var pencil = new Tool({
    speculateDrag: function(x,y) {
      return new UndoStep([
        new TileState(tiles[x][y], {type:brushTileType})
      ]);
    },
  });
  var brush = new Tool({
    speculateDrag: function(x,y) {
      var changes = [];
      for (var ix=x-1; ix<=x+1; ix++) {
        for (var iy=y-1; iy<=y+1; iy++) {
          if (ix>=0 && iy>=0 && ix<width && iy<height) {
            changes.push(new TileState(tiles[ix][iy], {type:brushTileType}));
          }
        }
      }
      return new UndoStep(changes);
    }
  });

  function lineFn (x0, y0, x1, y1) {
    var deltaX = x1 - x0;
    var deltaY = y1 - y0;
    var y = 0;

    var lineTiles = [];

    if (deltaX == 0) {
      var low = Math.min(y0, y1);
      var high = Math.max(y0, y1);
      for (var yi = low; yi <= high; yi++) {
        lineTiles.push({x: x0, y: yi});
      }

    } else if (deltaY == 0) {
      var left = Math.min(x0, x1);
      var right = Math.max(x0, x1);
      for (var xi = left; xi <= right; xi++) {
        lineTiles.push({x: xi, y: y0});
      }

    } else {
      var slope = deltaY / deltaX;
      var intercept;
      var intercept = y0 - slope * x0;

      if (Math.abs(slope) <= 1) {
        var left = Math.min(x0, x1);
        var right = Math.max(x0, x1);
        for (var xi = left; xi <= right; xi++) {
          var y = slope * xi + intercept;
          lineTiles.push({x: xi, y: Math.round(y)});
        }
      } else {
        var low = Math.min(y0, y1);
        var high = Math.max(y0, y1);
        for (var yi = low; yi <= high; yi++) {
          var x = (yi-intercept) / slope;
          lineTiles.push({x: Math.round(x), y: yi});
        }
      }
    }

    return lineTiles;
  }

  function constrainToSquare(x0, y0, x1, y1) {

    var xPrime, yPrime;
    var xOffset = Math.abs(x1-x0), yOffset = Math.abs(y1-y0);
    var offsetMin = Math.min(xOffset, yOffset);
    if (x1 >= x0 && y1 >= y0) {         // Quadrant I
      xPrime = x0 + offsetMin;
      yPrime = y0 + offsetMin;
    } else if (x1 <= x0 && y1 >= y0) {  // Quadrant II
      xPrime = x0 - offsetMin;
      yPrime = y0 + offsetMin;
    } else if (x1 <= x0 && y1 <= y0) {  // Quadrant III
      xPrime = x0 - offsetMin;
      yPrime = y0 - offsetMin;
    } else  {                           // Quadrant IV
      xPrime = x0 + offsetMin;
      yPrime = y0 - offsetMin;
    }
    return {x: xPrime, y: yPrime};
  }

  var line = new Tool({
    down: function(x,y) {
      this.downX = x;
      this.downY = y;
      console.log('down at ', x,y);
    },
    speculateUp: function(x,y) {
      var coordinates = lineFn(this.downX===undefined?x:this.downX, this.downY===undefined?y:this.downY, x, y);
      var calculatedTiles = [];
      for (var i = 0; i < coordinates.length; i++) {
        calculatedTiles.push(new TileState(tiles[coordinates[i].x][coordinates[i].y], {type: brushTileType}));
      }
      return new UndoStep(calculatedTiles);
    },
    up: function(x,y) {
      this.downX = undefined;
      this.downY = undefined;
    }
  })


  function rectFn (x0, y0, x1, y1, fill) {
    if (shiftDown) { // constrain to diagonal
      var adjustedPoint1 = constrainToSquare(x0,y0,x1,y1);
      x1 = adjustedPoint1.x;
      y1 = adjustedPoint1.y
    }
    var rectTiles = [];
    var left = Math.min(x0, x1);
    var right = Math.max(x0, x1);
    var low = Math.min(y0, y1);
    var high = Math.max(y0, y1);
    for (var xi = left; xi <= right; xi++) {
      for (var yi = low; yi <= high; yi++) {
        var addTile = fill || xi == left || xi == right || yi == low || yi == high;
        if (addTile) {
          rectTiles.push({x: xi, y: yi});
        }
      }
    }
    return rectTiles;
  }

  var rectFill = new Tool({
    down: function(x,y) {
      this.downX = x;
      this.downY = y;
      console.log('down at ', x,y);
    },
    speculateUp: function(x,y) {
      var coordinates = rectFn(this.downX===undefined?x:this.downX, this.downY===undefined?y:this.downY, x, y, true);
      var calculatedTiles = [];
      for (var i = 0; i < coordinates.length; i++) {
        calculatedTiles.push(new TileState(tiles[coordinates[i].x][coordinates[i].y], {type: brushTileType}));
      }
      return new UndoStep(calculatedTiles);
    },
    up: function(x,y) {
      this.downX = undefined;
      this.downY = undefined;
    }
  })

  var rectOutline = new Tool({
    down: function(x,y) {
      this.downX = x;
      this.downY = y;
      console.log('down at ', x,y);
    },
    speculateUp: function(x,y) {
      var coordinates = rectFn(this.downX===undefined?x:this.downX, this.downY===undefined?y:this.downY, x, y, false);
      var calculatedTiles = [];
      for (var i = 0; i < coordinates.length; i++) {
        calculatedTiles.push(new TileState(tiles[coordinates[i].x][coordinates[i].y], {type: brushTileType}));
      }
      return new UndoStep(calculatedTiles);
    },
    up: function(x,y) {
      this.downX = undefined;
      this.downY = undefined;
    }
  })

  // taken from http://members.chello.at/~easyfilter/bresenham.html
  function circleFn (x0, y0, x1, y1, fill) {
    if (shiftDown) { // constrain to diagonal
      var adjustedPoint1 = constrainToSquare(x0,y0,x1,y1);
      x1 = adjustedPoint1.x;
      y1 = adjustedPoint1.y
    }

    var circleTiles = [];
    var a = Math.abs(x1-x0), b = Math.abs(y1-y0), b1 = b&1; /* values of diameter */
    var dx = 4*(1-a)*b*b, dy = 4*(b1+1)*a*a; /* error increment */
    var err = dx+dy+b1*a*a, e2; /* error of 1.step */

    if (x0 > x1) { x0 = x1; x1 += a; } /* if called with swapped points */
    if (y0 > y1) y0 = y1; /* .. exchange them */
    y0 += (b+1)/2; y1 = y0-b1;   /* starting pixel */
    a *= 8*a; b1 = 8*b*b;

    function addToCircleTiles(x, y) {
      var flooredY = Math.floor(y);
      circleTiles.push({x: x, y: flooredY});
      if (fill) {
        for (var yi = Math.floor(y1); yi < flooredY; yi++) {
          circleTiles.push({x: x, y: yi});
        }
      }
    }
    do {
      addToCircleTiles(x1, y0); /*   I. Quadrant */
      addToCircleTiles(x0, y0); /*  II. Quadrant */
      addToCircleTiles(x0, y1); /* III. Quadrant */
      addToCircleTiles(x1, y1); /*  IV. Quadrant */
      e2 = 2*err;
      if (e2 <= dy) { y0++; y1--; err += dy += a; }  /* y step */
      if (e2 >= dx || 2*err > dy) { x0++; x1--; err += dx += b1; } /* x step */
    } while (x0 <= x1);

    while (y0-y1 < b) {  /* too early stop of flat ellipses a=1 */
      addToCircleTiles(x0-1, y0); /* -> finish tip of ellipse */
      addToCircleTiles(x1+1, y0++);
      addToCircleTiles(x0-1, y1);
      addToCircleTiles(x1+1, y1--);
    }
    return circleTiles;
  }

  var circleFill = new Tool({
    down: function(x,y) {
      this.downX = x;
      this.downY = y;
      console.log('down at ', x,y);
    },
    speculateUp: function(x,y) {
      var coordinates = circleFn(this.downX===undefined?x:this.downX, this.downY===undefined?y:this.downY, x, y, true);
      var calculatedTiles = [];
      for (var i = 0; i < coordinates.length; i++) {
        calculatedTiles.push(new TileState(tiles[coordinates[i].x][coordinates[i].y], {type: brushTileType}));
      }
      return new UndoStep(calculatedTiles);
    },
    up: function(x,y) {
      this.downX = undefined;
      this.downY = undefined;
    }
  })

  var circleOutline = new Tool({
    down: function(x,y) {
      this.downX = x;
      this.downY = y;
      console.log('down at ', x,y);
    },
    speculateUp: function(x,y) {
      var coordinates = circleFn(this.downX===undefined?x:this.downX, this.downY===undefined?y:this.downY, x, y, false);
      var calculatedTiles = [];
      for (var i = 0; i < coordinates.length; i++) {
        calculatedTiles.push(new TileState(tiles[coordinates[i].x][coordinates[i].y], {type: brushTileType}));
      }
      return new UndoStep(calculatedTiles);
    },
    up: function(x,y) {
      this.downX = undefined;
      this.downY = undefined;
    }
  })

  var fill = new Tool({
    speculateUp: function(x,y) {
      var targetType = tiles[x][y].type;

      var toChange = [ tiles[x][y] ];

      var changed = [ new TileState(tiles[x][y], {type:brushTileType}) ];
      var inChanged = {};
      while (toChange.length > 0) {

        var tempToChange = [];

        toChange.forEach(function(tile) {
          for (var ix=tile.x-1; ix<=tile.x+1; ix++) {
            for (var iy=tile.y-1; iy<=tile.y+1; iy++) {
              if (Math.abs(tile.x-ix) + Math.abs(tile.y-iy) == 1&& ix>=0 && iy>=0 && ix<width && iy<height) {
                var test = tiles[ix][iy];
                if (test.type == targetType && !inChanged[xy(test)]) {
                  tempToChange.push(test);
                  changed.push(new TileState(test, {type: brushTileType}));
                  inChanged[xy(test)] = true;
                }
              }
            }
          }
        });
        toChange = tempToChange;
      }
      return new UndoStep(changed);
    }
  })

  var wire = new Tool({
    type: 'special',
    unselect: function() {
      clearHighlights();
      this.selectedSwitch = null;
    },
    stateChange: function() {
      this.refreshHighlights();
    },
    getState: function() {
      console.log('storing state', this.selectedSwitch && xy(this.selectedSwitch))
      return {selectedSwitch: this.selectedSwitch}
    },
    setState: function(state) {
      this.selectedSwitch = state.selectedSwitch;
      console.log('restored state', this.selectedSwitch && xy(this.selectedSwitch))
    },
    speculateUp: function(x,y) {
      var tile = tiles[x][y];
      var change = null;
      if (tile.type == portalType) {
        if (this.selectedSwitch && this.selectedSwitch.type == portalType) {
          change = new TileState(this.selectedSwitch, {destination: tile})
          console.log('making destination action to', xy(tile));
          this.selectedSwitch = null;
        } else {
          this.selectedSwitch = tile;
          console.log('selected ', xy(this.selectedSwitch));
        }
      } else if (tile.type == switchType) {
        this.selectedSwitch = tile;
      } else if (this.selectedSwitch && this.selectedSwitch.type == switchType) {
        var affected = this.selectedSwitch.affected || ( this.selectedSwitch.affected={});
        var affected = {};
        for (var key in (this.selectedSwitch.affected||{})) {
          affected[key] = this.selectedSwitch.affected[key];;
        }
        var hitKey = xy(tile);
        if (affected[hitKey]) delete affected[hitKey];
        else affected[hitKey] = tile;
        
        change = new TileState(this.selectedSwitch, {affected: affected});
      }
      return new UndoStep(change ? [change] : []);
    }
  });
  wire.refreshHighlights = function() {
    clearHighlights();
    if (this.selectedSwitch) {
      this.selectedSwitch.highlight(true);
      if (this.selectedSwitch.type == portalType) {
        if (this.selectedSwitch.destination) {
          this.selectedSwitch.destination.highlight(true);
        }
      } else if (this.selectedSwitch.type == switchType) {
        var sel = this.selectedSwitch.affected || ( this.selectedSwitch.affected={});
        for (var key in sel) {
          sel[key].highlight(true);
        }
      }
    }
  }

  function clearHighlights() {
    $map.find('.selectionIndicator').css('display', 'none');
  }

  function ensureUnique(placedX, placedY) {
    for (var x=0; x<width; x++) {
      for (var y=0; y<height; y++) {
        if (x==placedX && y==placedY) continue;
        if (tiles[x][y].type == this) {
          tiles[x][y].setType(floorType);
        }
      }
    }
  }

  function Point(sourceOrX, maybeY) {
    if (maybeY) {
      this.x = sourceOrX;
      this.y = maybeY;
    } else {
      this.x = sourceOrX.x;
      this.y = sourceOrX.y;
    }
  }
  Point.cmp = function(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    if (a.x != b.x) return a.x - b.x;
    return a.y - b.y;
  }
  function TileState(source, changes) {
    changes = changes || {};
    this.x = changes.x || source.x 
    this.y = changes.y || source.y;
    this.type = changes.type || source.type;
    this.affected = [];
    var affectedMap = changes.affected || source.affected || {};
    for (var key in affectedMap) {
      this.affected.push(new Point(affectedMap[key]));
    }
    this.affected.sort(Point.cmp);
    var destTile = changes.destination || source.destination;
    this.destination = destTile && new Point(destTile);
  }
  TileState.prototype.equals = function(other) {
    if (this.x!=other.x
      || this.y!=other.y
      || this.type!=other.type
      || Point.cmp(this.destination, other.destination)
      || this.affected.length != other.affected.length) return false;
    for (var i=0; i<this.affected.length; i++) {
      if (Point.cmp(this.affected[i], other.affected[i])) return false;
    }
    return true;
  }
  TileState.prototype.restoreInto = function(tile) {
    tile.setType(this.type);
    tile.affected = {};
    for (var i=0; i<this.affected.length; i++) {
      var a = this.affected[i];
      tile.affected[xy(a)] = tiles[a.x][a.y];
    }
    tile.destination = this.destination && tiles[this.destination.x][this.destination.y];
    mayHaveChanged(tile);
  }

  function recordStep() {
    var changes = [];

    if (!backingStates || backingStates.length != tiles.length || backingStates[0].length != tiles[0].length) {
      var size;
      if (backingStates) {
        for (var x=0; x<backingStates.length; x++) {
          for (var y=0; y<backingStates[0].length; y++) {
            if (x>= tiles.length || y>=tiles[0].length) {
              changes.push(backingStates[x][y]);
            }
          }
        }
        size = new Point({x:backingStates.length, y:backingStates[0].length});
      }
      backingStates = [];
      for (var x=0; x<tiles.length; x++) {
        backingStates[x] = [];
        for (var y=0; y<tiles[x].length; y++) {
          backingStates[x][y] = new TileState(tiles[x][y]);
        }
      }

      dirtyStates = {}
      return new UndoStep(changes, size);
    }

    for (var key in dirtyStates) {
      var newState = new TileState(dirtyStates[key]);
      if (!newState.equals(backingStates[newState.x][newState.y])) {
        changes.push(backingStates[newState.x][newState.y]);
        backingStates[newState.x][newState.y] = newState;
      }
    }
    dirtyStates = {}
    if (!changes.length) return null;
    return new UndoStep(changes, null);
  }

  function savePoint() {
    var step = recordStep();
    if (step) {
      undoSteps.push(step);
      redoSteps = [];
      enableUndoRedoButtons();
    }
  }
  
  function applyStep(step) {
    var tileChanges = step.states;
    if (step.size) {
      var types = [];
      for (var x=0; x<step.size.x; x++) {
        types[x] = [];
        for (var y=0; y<step.size.y; y++) {
          types[x][y] = x<tiles.length && y<tiles[0].length ? tiles[x][y].type : emptyType;
        }
      }
      buildTilesWith(types);
      for (var x=0; x<backingStates.length && x<tiles.length; x++) {
        for (var y=0; y<backingStates[x].length && y<tiles[0].length; y++) {
          backingStates[x][y].restoreInto(tiles[x][y]);
        }
      }
    }

    for (var i=0; i<tileChanges.length; i++) {
      var change = tileChanges[i];
      change.restoreInto(tiles[change.x][change.y]);
    }
    cleanDirtyWalls();
    if (selectedTool) selectedTool.stateChange();
  }

  function moveChange(fromSteps, toSteps) {
    if (!fromSteps.length) return;

    var step = fromSteps.splice(fromSteps.length-1, 1)[0];
    applyStep(step);
    
    var step = recordStep();
    if (step) {
      toSteps.push(step);
    }
  }

  function enable($elem, enabled) {
    if (enabled) $elem.removeAttr('disabled');
    else $elem.attr('disabled', 'disabled')
  }
  function enableUndoRedoButtons() {
    enable($('#undo'), undoSteps.length);
    enable($('#redo'), redoSteps.length);
  }
  function undo() {
    moveChange(undoSteps, redoSteps);
    enableUndoRedoButtons();
  }
  function redo() {
    moveChange(redoSteps, undoSteps);
    enableUndoRedoButtons();
  }

  function xy(pt) {
    return pt.x + ',' + pt.y;
  }

  var backingStates = null;
  var dirtyStates = {};
  function mayHaveChanged(tile) {
    dirtyStates[xy(tile)] = tile;
  }

  function UndoStep(states, size) {
    this.states = states;
    this.size = size;
  }
  var undoSteps = [];
  var redoSteps = [];

  function setFieldFn(defaultState) {
    return function(logic, tile) {
      logic.fields[tile.x + ',' + tile.y] = {defaultState: defaultState};
    }
  }

  function exportSwitch(logic, tile) {
    var toggles = [];
    for (var key in tile.affected) {
      var affectedTile = tile.affected[key];
      var t = affectedTile.type;
      if (t==bombType || t==onFieldType || t==offFieldType || t==redFieldType || t==blueFieldType) {
        toggles.push({pos: {x: affectedTile.x, y: affectedTile.y}});
      }
    }
    logic.switches[tile.x + ',' + tile.y] = {toggle: toggles};
  }
  function exportPortal(logic, tile) {
    var dest = tile.destination || tile;
    logic.portals[tile.x + ',' + tile.y] = {destination: {x: dest.x, y: dest.y}};
  }

  var floorType, emptyType, 
    wallType, wallTopLeftType, wallTopRightType, wallBottomLeftType, wallBottomRightType,
    blueFlagType, redFlagType, switchType, bombType, onFieldType, offFieldType,
    redFieldType, blueFieldType, portalType, redSpawnType, blueSpawnType, redSpeedPadType, blueSpeedpadType, redFloorType, blueFloorType,
    spikeType, powerupType, speedpadType,
    yellowFlagType, redEndzoneType, blueEndzoneType;
  var tileTypes = [
    emptyType = new TileType('empty', 13,5, 0,0,0, "Background"),
    floorType = new TileType('floor',13,4, 212,212,212, "Tile"),
    wallType = new TileType('wall', 0,0, 120,120,120, "Wall", {wallSolids: 0xff}), // encoding: bit 0 is noon, goes clockwise
    wallBottomLeftType = new TileType('wallBottomLeft', 2,0, 128,112,64, "Wall BL", {wallSolids: 0x78}),
    wallTopLeftType = new TileType('wallTopLeft', 7,5, 64,128,80, "Wall TL", {wallSolids: 0xe1}),
    wallTopRightType = new TileType('wallTopRight', 11,6, 64,80,128, "Wall TR", {wallSolids: 0x87}),
    wallBottomRightType = new TileType('wallBottomRight', 5,8, 128,64,112, "Wall BR", {wallSolids: 0x1e}),
    switchType = new TileType('switch', 13,6, 185,122,87, "Button - Emits signals to gates and bombs.", {logicFn: exportSwitch}),
    spikeType = new TileType('spike', 12,0, 55,55,55, "Spike"),
    bombType = new TileType('bomb', 12,1, 255,128,0, "Bomb - Receives signals from switches."),
    powerupType = new TileType('powerup', 12,7, 0,255,0, "Powerup"),
    speedpadType = new TileType('speedpad', 0,0, 255,255,0, "Boost", {image: 'speedpad'}),
    blueSpeedpadType = new TileType('blueSpeedpad', 0,0, 115,115,255, "Blue Team Boost", {image: 'speedpadblue'}),
    redSpeedPadType = new TileType('redSpeedpad', 0,0, 255,115,115, "Red Team Boost", {image: 'speedpadred'}),
    redFloorType = new TileType('redFloor', 14,4, 220,186,186, "Red Speed Tile - Increases speed for non-flag-carriers."),
    blueFloorType = new TileType('blueFloor', 15,4, 187,184,221, "Blue Speed Tile - Increases speed for non-flag-carriers."),
    offFieldType = new TileType('offField', 12,3, 0,117,0, "Gate - Default Off", {logicFn: setFieldFn('off')}),
    onFieldType = new TileType('onField', 13,3, 0,117,0, "Gate - Default On", {logicFn: setFieldFn('on')}),
    redFieldType = new TileType('redField', 14,3, 0,117,0, "Gate - Default Red", {logicFn: setFieldFn('red')}),
    blueFieldType = new TileType('blueField', 15,3, 0,117,0, "Gate - Default Blue", {logicFn: setFieldFn('blue')}),
    portalType = new TileType('portal', 0,0, 202, 192,0, "Portal - Link two portals using the wire tool.", {image: 'portal', logicFn: exportPortal}),
    redFlagType = new TileType('redFlag', 14,1, 255,0,0, "Red Flag"),
    blueFlagType = new TileType('blueFlag', 15,1, 0,0,255, "Blue Flag"),
    redSpawnType = new TileType('redSpawn', 14,0, 155,0,0, "Red Spawn Tile - Red balls will spawn within a certain radius of this tile."),
    blueSpawnType = new TileType('blueSpawn', 15,0, 0,0,155, "Blue Spawn Tile - Blue balls will spawn within a certain radius of this tile."),
    yellowFlagType = new TileType('yellowFlag', 13,1, 128,128,0, "Yellow Flag - Bring this neutral flag to your zone to score."),
    redEndzoneType = new TileType('redEndzone', 14,5, 185,0,0, "Red Endzone - Bring a neutral (yellow) flag to this zone to score."),
    blueEndzoneType = new TileType('blueEndzone', 15,5, 25,0,148, "Blue Endzone - Bring a neutral (yellow) flag to this zone to score.")
  ]
  function areOpposites(t1, t2) {
    t1.opposite = t2;
    t2.opposite = t1; 
  }
  areOpposites(redSpeedPadType, blueSpeedpadType);
  areOpposites(redFloorType, blueFloorType);
  areOpposites(redFieldType, blueFieldType);
  areOpposites(redFlagType, blueFlagType);
  areOpposites(redSpawnType, blueSpawnType);
  areOpposites(redEndzoneType, blueEndzoneType);
  

  function Tile(options, elem) {
    this.set(options);
    if (elem) {
      this.elem = elem;
      this.setType(options.type, true);
      this.background = elem.parent();
      
      var domElem = elem[0];
      // clockwise from noon: TR, BR, BL, TL
      this.quadrantElems = [domElem.children[0], domElem.children[1], domElem.children[2],domElem.children[3]];
      
      this.selectionIndicator = domElem.children[4];
      this.affectedIndicator = domElem.children[5];
    }
  }
  Tile.prototype.set = function(options) {
    this.x = options.x;
    this.y = options.y;
    this.type = options.type;
    this.affected = {};
    for (var key in options.affected || {}) {
      this.affected[key] = options.affected[key]
    }
    this.destination = options.destination;
  }
  Tile.prototype.setType = function(type, force) {
    if  (this.type==type && !force) return;
    this.type = type;
    type.drawOn(this.elem, this);
    if (type.postPlaceFn) {
      type.postPlaceFn.call(type, this.x, this.y);
    }

    maybeIsDirtyWall(this.x-1, this.y);
    maybeIsDirtyWall(this.x+1, this.y);
    maybeIsDirtyWall(this.x, this.y-1);
    maybeIsDirtyWall(this.x, this.y+1);
    mayHaveChanged(this);
  }
  Tile.prototype.highlight = function(highlighted) {
    this.elem.find('.selectionIndicator').css('display', highlighted ? 'inline-block' : 'none');
  }
  Tile.prototype.highlightWithPotential = function(highlighted) {
    this.elem.find('.potentialHighlight').css('display', highlighted ? 'inline-block' : 'none');
  }
  function clearPotentialHighlights() {
    $map.find('.potentialHighlight').css('display', 'none');
  }


  var dirtyWalls = {};
  function isWall(x, y) {
    return tiles[x] && tiles[x][y] && tiles[x][y].type.isWall();
  }
  function maybeIsDirtyWall(x, y) {
    if (isWall(x,y)) dirtyWalls[x + ',' + y] = tiles[x][y];
  }
  function cleanDirtyWalls() {
    for (var key in dirtyWalls) {
      var wall = dirtyWalls[key];
      if (wall.type.isWall()) continue;

      wall.type.drawOn(wall.elem, wall);
    }
    dirtyWalls = {};
  }

  var $map = $('#map');
  var $palette = $('#palette');

  var height;
  var width;
  var $tiles;
  var tiles;

  function buildTilesWith(types) {
    width = types.length;
    height = types[0].length;

    var html = '';
    var row = "<div class='tileRow'>";


    for (var x=0; x<width; x++) {
      row += "<div class='tileBackground'><div class='tile nestedSquare'>" +
        "<div class='tileQuadrant nestedSquareTR'></div>" +
        "<div class='tileQuadrant nestedSquareBR'></div>" +
        "<div class='tileQuadrant nestedSquareBL'></div>" +
        "<div class='tileQuadrant nestedSquareTL'></div>" +
        "<div class='selectionIndicator nestedSquare'></div><div class='potentialHighlight nestedSquare'></div></div></div>";
    }
    row += "</div>"
    for (var y=0; y<height; y++) {
      html += row;
    }
    $map.html( html );

    $tiles = $map.find('.tile');
    tiles = [];

    for (var x=0; x<width; x++) {
      tiles[x] = [];
      for (var y=0; y<height; y++) {
        var $tile = $($tiles[y*width + x]).data('x', x).data('y', y);
        var tile = tiles[x][y] = new Tile({x: x, y: y, type: types[x][y]}, $tile);
      }
    }

    cleanDirtyWalls();

    $('#resizeWidth').val(width);
    $('#resizeHeight').val(height);
    showZoom();
  }

  function clearMap() {
    var emptyTypes = [];
    var clearX = tiles ? width : 20;
    var clearY = tiles ? height : 20;
    for (var x=0;x<clearX;x++) {
      var col = emptyTypes[x] = [];
      for (var y=0; y<clearY; y++) {
        col.push(floorType)
      }
    }
    buildTilesWith(emptyTypes);
    savePoint();
    clearHistory();
    $('#mapName').val('Untitled');
    $('#author').val('Anonymous');
  };
  clearMap();

  var symmetry = 'None';

  $('#symmetry').change(function() {
    console.log('Symmetry was ', symmetry);
    symmetry = $(this).val();
    console.log('Symmetry is ', symmetry);
  });

  var potentialTiles = [];
  var potentialSymmetryTiles = []; // these are tiles that will oppositely colored


  function applyPotentials() {
    $.each(potentialSymmetryTiles, function(key, tile) {
      tile.setType(brushTileType.opposite);
    });
    $.each(potentialTiles, function(key, tile) {
      tile.setType(brushTileType);
    });
    cleanDirtyWalls();
  }

  function setPotentials(tiles, symmetryTiles) {
    //console.log('Setting potentials', tiles);
    potentialTiles = tiles;
    potentialSymmetryTiles = symmetryTiles;
    $.each(potentialTiles, function(key, tile) {
      tile.highlightWithPotential(true);
    });
    $.each(potentialSymmetryTiles, function(key, tile) {
      tile.highlightWithPotential(true);
    } )
  }
  
  function transformPoint(pt, how) {
    pt.x = pt.x*how[0] + (tiles.length-1)*how[1];
    pt.y = pt.y*how[2] + (tiles[0].length-1)*how[3];
    if (pt.type && how[4]) pt.type = pt.type.opposite;
  }
  
  var symmetryFns = {
    'Horizontal': [
      [1,0,  1,0],
      [-1,1, 1,0, true]
    ],
    'Vertical': [
      [1,0, 1,0],
      [1,0, -1,1, true]
    ],
    '4-Way': [
      [1,0, 1,0],
      [-1,1, 1,0, true],
      [1,0, -1,1, true],
      [-1,1, -1,1]
    ],
    'Rotational': [
      [1,0, 1,0],
      [-1,1, -1,1, true]
    ]
  }
  
  function applySymmetry(step) {
    var transforms = symmetryFns[symmetry];
    var tileChangeMap = {};
    if (transforms) {
      step.states.forEach(function(state) {
        transforms.forEach(function(transform) {
          var transformedState = new TileState(state);
          transformPoint(transformedState, transform);
          if (transformedState.affected) {
            transformedState.affected.forEach(function(pt) {
              transformPoint(pt, transform);
            });
          }
          if (transformedState.destination) {
            transformPoint(transformedState.destination, transform);
          }
          tileChangeMap[xy(transformedState)] = transformedState;
        });
        
      });
    }
    
    
    step.states.forEach(function(state) {
      tileChangeMap[xy(state)] = state;
    });
    
    step.states = [];
    for (var key in tileChangeMap) {
      step.states.push(tileChangeMap[key]);
    }
  }
  
  function setSpeculativeStep(step) {
    applySymmetry(step);
    $.each(step.states, function(idx, state) {
      tiles[state.x][state.y].highlightWithPotential(true);
    });
  }
  
  $map.mouseleave(function(e) {
    console.log('map left');
  });

  var controlDown = false;
  var shiftDown = false;

  $(document).keydown(function(e) {
    if(e.which==17) { // control
      controlDown = true;
    } else if (e.which==16) {
      shiftDown = true;
    } else if (e.which==90) { //z
      undo();
    } else if (e.which==89) { //y
      redo();
    }
  }).keyup(function(e) {
    if (e.which==17) { // control
      controlDown = false;
    }
    if (e.which==16) {
      shiftDown = false;
    }
  });
  
  $(window).blur (function() { // If the user ctrl-tabs away, it won't the keyup won't register
    controlDown = false;
  })

  var lineAnchor = null;

  var mouseDown = false;
  $map.on('mouseenter', '.tile', function(e) {

    var x = $(this).data('x');
    var y = $(this).data('y');

    if (!selectedTool) return;

    if (selectedTool.speculateDrag || selectedTool.speculateUp) { // should really test for speculatedDown || speculateDrag, maybe
      var st = selectedTool.getState();
      var change = selectedTool.speculateDrag && selectedTool.speculateDrag(x,y);
      if (!change) {
        change = selectedTool.speculateUp && selectedTool.speculateUp(x,y)
      }
      selectedTool.setState(st);
      setSpeculativeStep(change);
      return;
    }
    })
    .on('mouseleave', '.tile', function(e) {
      potentialTiles = [];
      potentialSymmetryTiles = [];
      clearPotentialHighlights();
//      console.log('mouse left ', $(this).data('x'), $(this).data('y'));
    })
    .on('mousedown', '.tile', function(e) {
      if (e.which==1) {
        var x = $(this).data('x');
        var y = $(this).data('y');
        if (!controlDown) {
          mouseDown = true;

          selectedTool.down(x,y)
          var change = selectedTool.speculateDrag(x,y);
          if (change) {
            applySymmetry(change);
            applyStep(change);
            selectedTool.stateChange();
          }
          
          e.preventDefault();
        }
      }
    })
    .on('mousemove', '.tile', function() {
      var x = $(this).data('x');
      var y = $(this).data('y');
      if (selectedTool && mouseDown) {
        var change = selectedTool.speculateDrag && selectedTool.speculateDrag(x,y);
        if (change) {
          applySymmetry(change);
          applyStep(change);
        } else if (selectedTool.speculateUp) {
          var st = selectedTool.getState();
          change = selectedTool.speculateUp(x,y);
          selectedTool.setState(st);
          if (change) setSpeculativeStep(change);
        }
      }
    })
    .on('mouseup', '.tile', function(e) {
      if (e.which==1) {
        var x = $(this).data('x');
        var y = $(this).data('y');
        if (controlDown) {
          var eyeDropBrushType = tiles[x][y].type;
          setBrushTileType(eyeDropBrushType);
        } else {
          var change = selectedTool.speculateUp(x,y);
          if (change) {
            applySymmetry(change);
            applyStep(change);
            selectedTool.stateChange();
          }
          selectedTool.up(x,y);
        
          savePoint();
        }
        mouseDown = false;
        cleanDirtyWalls();
      }
    });


  var wall = String.fromCharCode(120)+String.fromCharCode(120)+String.fromCharCode(120)+String.fromCharCode(255);
  var open = String.fromCharCode(212)+String.fromCharCode(212)+String.fromCharCode(212)+String.fromCharCode(255);
  function createPng() {
    var text = '';
    for (var y=0; y<height; y++) {
      for (var x=0; x<width; x++) {
        text += tiles[x][y].type.color;
      }
    }
    return text;
  }

  function makeLogic() {
    var logic = {
      info: {
        name: $('#mapName').val(),
        author: $('#author').val()
      },
      switches: {},
      fields: {},
      portals: {}
    };

    for (var x=0; x<width; x++) {
      for (var y=0; y<height; y++) {
        var fn = tiles[x][y].type.logicFn;
        if (fn) fn(logic, tiles[x][y])
      }
    }
    return logic;
  }

  function extractMap() {
    var map = {};
    map.tiles = [];
    for (var y=0; y<height; y++) {
      var row = map.tiles[y] = [];
      for (var x=0; x<width; x++) {
        var tile = tiles[x][y];
        var cell;
        if (tile.type == portalType) {
          cell = {
            type: tile.type.name,
            destination: tile.destination ? [tile.destination.x, tile.destination.y] : [x,y]
          }
        } else if (tile.type == switchType) {
          var targets = [];
          for (var key in tile.affected||[]) {
            var affected = tile.affected[key];
            targets.push([affected.x, affected.y])
          }
          cell = {
            type: tile.type.name,
            targets: targets
          }
        } else {
          cell = tile.type.name;
        }
        row[x] = cell;
      }
    }
    return map;
  }

  function getPngBase64() {
    return Base64.encode(generatePng(width, height, createPng()));
  }
  
  function getPngBase64Url() {
    return 'data:image/png;base64,' + getPngBase64();
  }

  $('#export').click(function() {
    $('.dropArea').removeClass('hasImportable');
    $('.dropArea').addClass('hasExportable');
    $(jsonDropArea).attr('href', 'data:application/json;base64,' + Base64.encode(JSON.stringify(makeLogic())));
    $(pngDropArea).attr('href', getPngBase64Url());
  });

  $('#save').click(function() {
    localStorage.setItem('png', getPngBase64Url());
    localStorage.setItem('json', JSON.stringify(makeLogic()));
  });

  function isValidMapStr() {
    var hasRedFlag = false;
    var hasBlueFlag = false;
    var hasRedEndzone = false;
    var hasBlueEndzone = false;
    $.each(tiles, function(rowIdx, row) {
      $.each(row, function(tileIdx, tile) {
        if (tile.type.name == "redFlag") hasRedFlag = true;
        if (tile.type.name == "blueFlag") hasBlueFlag = true;
        if (tile.type.name == "redEndzone") hasRedEndzone = true;
        if (tile.type.name == "blueEndzone") hasBlueEndzone = true;
      });
    });
    if (!(hasRedEndzone || hasRedFlag))
      return "A map requires a red flag or a red endzone to test.";
    if (!(hasBlueEndzone || hasBlueFlag))
      return "A map requires a blue flag or a blue endzone to test.";
    return "Valid";
  }

  $('#test, #testeu').click(function(e) {
    var validStr = isValidMapStr();
    if (validStr != "Valid") {
      alert(validStr);
      return false;
    }
    var eu = e.target.id == 'testeu' ? true : false;
    $.post('test', {logic: JSON.stringify(makeLogic()), layout: getPngBase64(), eu: eu}, function(data) {
      if (data && data.location) {
        window.open(data.location);
      } else {
        alert("Test couldn't get started.")
      }
      //console.log('back from test', data)
    });
    return false;
  });
  
  function setBrushTileType(type) {
    $('.tileTypeSelectionIndicator').css('display', 'none');
    $('.tilePaletteOption').each(function(idx, el) {
      if ($(el).data('tileType') == type) {
        brushTileType = type;
        $(el).find('.tileTypeSelectionIndicator').css('display', 'inline-block');
      }
    })
  }

  var paletteRows = [
    [wallType, wallTopLeftType, wallTopRightType, wallBottomLeftType, wallBottomRightType, floorType, emptyType], 
    [spikeType, powerupType, portalType],
    [redFlagType, blueFlagType, redSpawnType, blueSpawnType, redEndzoneType, blueEndzoneType, yellowFlagType, ],
    [speedpadType, redSpeedPadType, blueSpeedpadType, '', '', redFloorType, blueFloorType],
    [switchType, offFieldType, onFieldType, redFieldType, blueFieldType, '', bombType]
  ]

  var brushTileType = paletteRows[0][0];
  

  $.each(paletteRows, function(rowIdx, row) {
    var $rowDiv = $("<div></div>");
    $.each(row, function(cellIdx, type) {
      if (!type) {
        $rowDiv.append($("<div style='width:40px;display:inline-block;'></div>"));
        return;
      }
      var $button = $("<div class='tileBackground tilePaletteOption' title = '" + type.toolTipText + "'><div class='tile'><div class='tileTypeSelectionIndicator'></div></div></div>");
      $button.data('tileType', type);
      type.drawOn($button.find('.tile'));
      $button.click('click', function() {
        if (selectedTool == wire) {
          $('#toolPencil').trigger('click');
        }
        setBrushTileType(type);
      });
      $rowDiv.append($button);
    });
    $palette.append($rowDiv);
  })

  $('.tileTypeSelectionIndicator:first').css('display', 'inline-block');

  $('#toolPencil').data('tool', pencil);
  $('#toolBrush').data('tool', brush);
  $('#toolLine').data('tool', line);
  $('#toolRectFill').data('tool', rectFill);
  $('#toolRectOutline').data('tool', rectOutline);
  $('#toolCircleFill').data('tool', circleFill);
  $('#toolCircleOutline').data('tool', circleOutline);
  $('#toolFill').data('tool', fill);
  $('#toolWire').data('tool', wire);
  $('#tools .btn').click(function() {
    selectedTool.unselect.call(selectedTool);
    $('#tools .btn').removeClass('active');
    $(this).toggleClass('active');
    selectedTool = $(this).data('tool');
    selectedTool.select.call(selectedTool);
    potentialTiles = [];
  })

  var selectedTool = pencil;
  $('#toolPencil').toggleClass("active");
//  $('#toolPencil').trigger('click');

  $('#undo').click(undo);
  $('#redo').click(redo);

  var importJson;
  var importPng;
  //$jsonDrop.ondragover = function () { this.className = 'hover'; return false; };
  //$jsonDrop.ondragend = function () { this.className = ''; return false; };
  var jsonDropArea = document.getElementById('jsonDrop')
  jsonDropArea.ondragover = function () { return false; };
  jsonDropArea.ondragend = function () { return false; };

  jsonDropArea.addEventListener("dragstart",function(evt){
    evt.dataTransfer.setData("DownloadURL",
      'data:application/json;base64,' + Base64.encode(JSON.stringify(makeLogic())));
    return false;
  },false);

  var pngDropArea = document.getElementById('pngDrop');
  pngDropArea.ondragover = function () { return false; };
  pngDropArea.ondragend = function () { return false; };

  jsonDropArea.ondrop = pngDropArea.ondrop = function (e) {
    e.preventDefault();
    $('.dropArea').removeClass('hasExportable');
    for (var i=0; i<e.dataTransfer.files.length; i++) {
      var file = e.dataTransfer.files[i],
        reader = new FileReader();

      if (file.name.match(/json$/i)) {
        reader.onload = function (event) {
          importJson = event.target.result;
          $(jsonDropArea).addClass('hasImportable');
        };
        reader.readAsText(file);
      } else if (file.name.match(/png$/i)) {
        reader.onload = function (event) {
          importPng = event.target.result;
          $(pngDropArea).addClass('hasImportable');
        }
        reader.readAsDataURL(file);
      } else {
        alert('Expected a PNG or a JSON, but got ' + file.name);
      }
    }

    return false;
  };
  function restoreFromPngAndJson(pngBase64, jsonString, optWidth, optHeight, doHistoryClear) {
    var canvas = document.getElementById('importCanvas');
    var ctx = canvas.getContext('2d');
    var json = JSON.parse(jsonString);
    var img = new Image();
    img.onload = function() {
      var w = img.width;
      var h = img.height;
      optWidth = optWidth || w;
      optHeight = optHeight || h;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img,0,0);
      var imgd = ctx.getImageData(0, 0, w, h).data;
      var typeByColor = {};
      tileTypes.forEach(function(type) {
        typeByColor[type.rgb] = type;
      })

      var fields = json.fields || {};
      var cols = [];
      for (var x=0; x<optWidth; x++) {
        var col = [];
        for (var y=0; y<optHeight; y++) {
          var type;
          if (x<w && y<h) {
            var i = (y*w + x)*4;
            var pixel = imgd[i] | (imgd[i+1]<<8) | (imgd[i+2]<<16);
            type = typeByColor[pixel] || emptyType;
            if (type == onFieldType || type==offFieldType || type==redFieldType || type==blueFieldType) {
              type = {on: onFieldType, off: offFieldType, red: redFieldType, blue: blueFieldType
              }[(fields[x+','+y]||{}).defaultState] || offFieldType;
            }
          } else {
            type = emptyType;
          }
          col.push(type);
        }
        cols.push(col);
      }
      buildTilesWith(cols);

      var info = json.info || {};
      $('#mapName').val(info.name || '');
      $('#author').val(info.author || '');

      var portals = json.portals || {};
      for (var key in portals) {
        var xy = key.split(',');
        var tile = (tiles[xy[0]]||[])[xy[1]];
        if (tile && tile.type==portalType) {
          var dest = portals[key].destination||{};
          tile.destination = (tiles[dest.x]||[])[dest.y];
        }
      }

      var switches = json.switches || {};
      for (var key in switches) {
        var xy = key.split(',');
        var tile = (tiles[xy[0]]||[])[xy[1]];
        if (tile && tile.type == switchType) {
          tile.affected = []
          var toggles = (switches[key].toggle||[]);
          toggles.forEach(function(affected) {
            var pos = affected.pos || {};
            var affectedTile = (tiles[pos.x]||[])[pos.y];
            if (affectedTile) tile.affected[pos.x + ',' + pos.y] = (affectedTile);
          });
        }
      }

      savePoint();
      if (doHistoryClear) clearHistory();
    }
    img.src = pngBase64;//'https://mdn.mozillademos.org/files/5397/rhino.jpg';
  }
  
  function clearHistory() {
    undoSteps = redoSteps = []
    enableUndoRedoButtons();
  }

  $('#import').click(function() {
    if (importPng && importJson) {
      restoreFromPngAndJson(
        importPng,
        importJson, undefined, undefined, true);
    } else {
      alert('Please drag and drop a PNG and a JSON to import onto their receptacles.')
    }
  });

  function resizeTo(width, height) {
    var png = getPngBase64Url();
    var json = JSON.stringify(makeLogic());

    restoreFromPngAndJson(png, json, width, height);
  }

  $('#resize').click(function(e) {
    var width = parseInt($('#resizeWidth').val(), 10);
    var height = parseInt($('#resizeHeight').val(), 10);

    if (width * height > 3600) {
      if (!confirm('It\'s currently not possible to test maps larger than 3600 tiles.\nVery large maps can (will) lag your browser as well.\nAre you sure you want to resize?')) {
        $('#resizeWidth').val(tiles.length);
        $('#resizeHeight').val(tiles[0].length);
        e.preventDefault();
        return;
      }
    } else if ( width < 1 || height < 1) {
      alert('Min width/height is 1.');
      width = Math.max(1, width);
      height = Math.max(1, height);
    }
    resizeTo(width, height);
    e.preventDefault();
  });
  
  function showZoom() {
    tileSize = [10,20,30,40][zoom];
    var sizeCss = tileSize + 'px';
    var singleTileBackgroundSize = sizeCss + ' ' + sizeCss;
    
    function applySize(e) {
      e.style.width = e.style.height = sizeCss;
    }
    
    for (var x=0; x<tiles.length; x++) {
      for (var y=0; y<tiles[0].length; y++) {
        var tile = tiles[x][y];
        var typeIndicator = tile.elem[0];
        var bg = typeIndicator.parentNode;
        if (x==0) {
          var row = bg.parentNode;
          row.style.height = sizeCss;
        }
        applySize(tile.affectedIndicator);
        applySize(tile.selectionIndicator);
        tile.selectionIndicator.style.backgroundSize = singleTileBackgroundSize;
        applySize(tile.elem[0]);
        applySize(tile.background[0]);
        
        tile.type.drawOn(tile.elem, tile);
        floorType.drawOn(tile.background, null);
      }
    }
  }
  
  $('#clear').click(function() {
    if (confirm('Are you sure you want to clear the map?')) {
      clearMap();
    }
  });
  
  function enableZoomButtons() {
    enable($('#zoomIn'), zoom<maxZoom);
    enable($('#zoomOut'), zoom>0);
  }
  $('#zoomIn').click(function() {
    zoom = Math.min(maxZoom, zoom+1);
    showZoom();
    enableZoomButtons();
  });
  $('#zoomOut').click(function() {
    zoom = Math.max(0, zoom-1);
    showZoom();
    enableZoomButtons();
  });
  enableZoomButtons();
  
  $('#dropHelp').click(function() {
    alert("Importing Map:\n" +
      "Drag a .png file and a .json file from your file manager onto their respective squares. When both are added, hit Import to apply them to the current map.\n\n" +
      "Exporting Map:\n" +
      "Hit Export. The .png and .json files can then be dragged or clicked from their respective squares.")
  })
  
  var savedPng = localStorage.getItem('png')
  var savedJson = localStorage.getItem('json')
  restoreFromPngAndJson(savedPng, savedJson, undefined, undefined, true);
  
  var quadrantCoords = {
    "1.310": [10.5, 7.5],
    "1.410": [11, 7.5],
    "1.110": [11, 8],
    "1.210": [10.5, 8],
    "1.310d": [0.5, 3.5],
    "1.410d": [1, 3.5],
    "1.210d": [0.5, 4],
    "1.321": [4.5, 9.5],
    "1.421": [5, 9.5],
    "1.121": [5, 10],
    "1.221": [4.5, 10],
    "1.321d": [1.5, 2.5],
    "1.421d": [2, 2.5],
    "1.221d": [1.5, 3],
    "1.332": [6.5, 9.5],
    "1.432": [7, 9.5],
    "1.132": [7, 10],
    "1.232": [6.5, 10],
    "1.332d": [9.5, 2.5],
    "1.432d": [10, 2.5],
    "1.132d": [10, 3],
    "1.343": [0.5, 7.5],
    "1.443": [1, 7.5],
    "1.143": [1, 8],
    "1.243": [0.5, 8],
    "1.343d": [10.5, 3.5],
    "1.443d": [11, 3.5],
    "1.143d": [11, 4],
    "1.354": [1.5, 6.5],
    "1.454": [2, 6.5],
    "1.154": [2, 7],
    "1.254": [1.5, 7],
    "1.454d": [9, 1.5],
    "1.154d": [9, 2],
    "1.254d": [8.5, 2],
    "1.365": [6.5, 8.5],
    "1.465": [7, 8.5],
    "1.165": [7, 9],
    "1.265": [6.5, 9],
    "1.465d": [11, 1.5],
    "1.165d": [11, 2],
    "1.265d": [10.5, 2],
    "1.376": [4.5, 8.5],
    "1.476": [5, 8.5],
    "1.176": [5, 9],
    "1.276": [4.5, 9],
    "1.376d": [0.5, 1.5],
    "1.176d": [1, 2],
    "1.276d": [0.5, 2],
    "1.307": [9.5, 6.5],
    "1.407": [10, 6.5],
    "1.107": [10, 7],
    "1.207": [9.5, 7],
    "1.307d": [2.5, 1.5],
    "1.107d": [3, 2],
    "1.207d": [2.5, 2],
    "1.320": [1.5, 7.5],
    "1.420": [2, 7.5],
    "1.220": [1.5, 8],
    "1.320d": [10.5, 0.5],
    "1.420d": [11, 0.5],
    "1.220d": [10.5, 1],
    "1.331": [5.5, 6.5],
    "1.431": [6, 6.5],
    "1.131": [6, 7],
    "1.231": [5.5, 7],
    "1.331d": [5.5, 0.5],
    "1.431d": [6, 0.5],
    "1.342": [9.5, 7.5],
    "1.442": [10, 7.5],
    "1.142": [10, 8],
    "1.342d": [0.5, 0.5],
    "1.442d": [1, 0.5],
    "1.142d": [1, 1],
    "1.353": [4.5, 5.5],
    "1.453": [5, 5.5],
    "1.153": [5, 6],
    "1.253": [4.5, 6],
    "1.453d": [7, 1.5],
    "1.153d": [7, 2],
    "1.464": [4, 9.5],
    "1.164": [4, 10],
    "1.264": [3.5, 10],
    "1.464d": [2, 3.5],
    "1.164d": [2, 4],
    "1.264d": [1.5, 4],
    "1.375": [5.5, 2.5],
    "1.475": [6, 2.5],
    "1.175": [6, 4],
    "1.275": [5.5, 4],
    "1.175d": [6, 3],
    "1.275d": [5.5, 3],
    "1.306": [7.5, 9.5],
    "1.106": [8, 10],
    "1.206": [7.5, 10],
    "1.306d": [9.5, 3.5],
    "1.106d": [10, 4],
    "1.206d": [9.5, 4],
    "1.317": [6.5, 5.5],
    "1.417": [7, 5.5],
    "1.117": [7, 6],
    "1.217": [6.5, 6],
    "1.317d": [4.5, 1.5],
    "1.217d": [4.5, 2],
    "1.327": [7.5, 8.5],
    "1.427": [8, 8.5],
    "1.101": [4, 5],
    "1.227": [7.5, 9],
    "1.327d": [8.5, 3.5],
    "1.227d": [8.5, 4],
    "1.330": [8.5, 7.5],
    "1.430": [9, 7.5],
    "1.112": [2, 0],
    "1.230": [8.5, 8],
    "1.330d": [3.5, 0.5],
    "1.430d": [4, 0.5],
    "1.341": [2.5, 7.5],
    "1.441": [3, 7.5],
    "1.141": [3, 8],
    "1.223": [9.5, 0],
    "1.341d": [7.5, 0.5],
    "1.441d": [8, 0.5],
    "1.352": [3.5, 8.5],
    "1.452": [4, 8.5],
    "1.152": [4, 9],
    "1.234": [7.5, 5],
    "1.452d": [3, 3.5],
    "1.152d": [3, 4],
    "1.345": [7.5, 6.5],
    "1.463": [10, 8.5],
    "1.163": [10, 9],
    "1.263": [9.5, 9],
    "1.463d": [2, 0.5],
    "1.163d": [2, 1],
    "1.356": [6.5, 7.5],
    "1.474": [9, 9.5],
    "1.174": [9, 10],
    "1.274": [8.5, 10],
    "1.174d": [10, 5],
    "1.274d": [9.5, 5],
    "1.305": [2.5, 9.5],
    "1.467": [5, 7.5],
    "1.105": [3, 10],
    "1.205": [2.5, 10],
    "1.105d": [2, 5],
    "1.205d": [1.5, 5],
    "1.316": [1.5, 8.5],
    "1.470": [4, 6.5],
    "1.116": [2, 9],
    "1.216": [1.5, 9],
    "1.316d": [9.5, 0.5],
    "1.216d": [9.5, 1],
    "1.337": [10.5, 9.5],
    "1.437": [11, 9.5],
    "1.102": [0, 7],
    "1.237": [10.5, 10],
    "1.337d": [10.5, 4.5],
    "1.102d": [0, 0],
    "1.340": [8.5, 10.5],
    "1.440": [9, 10.5],
    "1.113": [6, 8],
    "1.213": [5.5, 8],
    "1.340d": [3.5, 2.5],
    "1.440d": [8, 2.5],
    "1.351": [0.5, 9.5],
    "1.451": [1, 9.5],
    "1.151": [1, 10],
    "1.224": [11.5, 7],
    "1.224d": [11.5, 0],
    "1.451d": [1, 4.5],
    "1.335": [11.5, 8.5],
    "1.462": [0, 5.5],
    "1.162": [0, 5],
    "1.235": [11.5, 9],
    "1.462d": [0, 4.5],
    "1.162d": [0, 6],
    "1.346": [11.5, 7.5],
    "1.473": [8, 6.5],
    "1.173": [8, 7],
    "1.273": [7.5, 7],
    "1.346d": [2.5, 4.5],
    "1.173d": [9, 3],
    "1.357": [5.5, 10.5],
    "1.457": [6, 10.5],
    "1.104": [6, 5],
    "1.204": [5.5, 5],
    "1.104d": [7, 5],
    "1.204d": [4.5, 5],
    "1.315": [3.5, 6.5],
    "1.460": [0, 7.5],
    "1.115": [4, 7],
    "1.215": [3.5, 7],
    "1.460d": [9, 4.5],
    "1.215d": [2.5, 3],
    "1.326": [11.5, 5.5],
    "1.471": [0, 8.5],
    "1.171": [0, 9],
    "1.226": [11.5, 5],
    "1.326d": [11.5, 4.5],
    "1.226d": [11.5, 6],
    "1.347": [9.5, 10.5],
    "1.447": [10, 10.5],
    "1.103": [9, 6],
    "1.203": [8.5, 6],
    "1.347d": [3.5, 1.5],
    "1.103d": [4, 1],
    "1.350": [1.5, 10.5],
    "1.450": [2, 10.5],
    "1.114": [3, 6],
    "1.214": [2.5, 6],
    "1.214d": [7.5, 1],
    "1.450d": [8, 1.5],
    "1.325": [4.5, 7.5],
    "1.461": [4, 3.5],
    "1.161": [4, 4],
    "1.225": [4.5, 8],
    "1.225d": [8.5, 5],
    "1.461d": [8, 4.5],
    "1.336": [7.5, 3.5],
    "1.472": [7, 7.5],
    "1.172": [7, 8],
    "1.236": [7.5, 4],
    "1.336d": [3.5, 4.5],
    "1.172d": [3, 5],
    "1.300": [5.5, 5.5],
    "1.400": [6, 5.5],
    "1.100": [6, 6],
    "1.200": [5.5, 6],
    "1.300d": [5.5, 8.5],
    "1.400d": [6, 8.5],
    "1.100d": [6, 10],
    "1.200d": [5.5, 10]
  };
});
