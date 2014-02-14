$(function() {
  var importJson;
  var importPng;

  var tileSize = 40;
  function positionCss(x, y) {
    return -x*tileSize + 'px ' + -y*tileSize + 'px';
  }
  function TileType(name, sheetX, sheetY, r,g,b, extra) {
    this.name = name;
    this.sheetX = sheetX;
    this.sheetY = sheetY;
    this.color = String.fromCharCode(r)+String.fromCharCode(g)+String.fromCharCode(b)+String.fromCharCode(255);
    this.postPlaceFn = extra&&extra.postPlaceFn;
    this.logicFn = extra&&extra.logicFn;
    this.image = extra&&extra.image;
    this.rgb = r | (g<<8) | (b<<16);
  }
  TileType.prototype.positionCss = function() {
    return positionCss(this.sheetX, this.sheetY)
  }
  TileType.prototype.drawOn = function($elem, tile) {
    var styleBgColor = '';
    var styleUrl = 'url("' + (this.image || 'default-skin') + '.png")';
    if (this.name == 'empty') {
      styleBgColor = 'black';
      styleUrl = '';
    }
    if (styleBgColor != $elem.styleBgColor) {
      $elem.css('background-color', styleBgColor);
      $elem.styleBgColor = styleBgColor;
    }
    if (styleUrl != $elem.styleUrl) {
      $elem.css('background-image', styleUrl)
      $elem.styleUrl = styleUrl;
    }
    if (this == wallType && tile) {
      var x = tile.x, y = tile.y;
      var idx = (isWall(x-1,y)?1:0) | (isWall(x+1,y)?2:0) | (isWall(x,y-1)?4:0) | (isWall(x,y+1)?8:0);
      var coords = [
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
      ][idx];
      $elem.css('background-position', positionCss(coords[0], coords[1]))
    } else {
      $elem.css('background-position', this.positionCss())
    }
  }


  function Tool(fns) {
    this.type = fns.type || '';
    this.calculateTiles = fns.calculateTiles || function() {};
    this.down = fns.down || function() {};
    this.drag = fns.drag || function() {};
    this.up = fns.up || function() {};
    this.select = fns.select || function() {};
    this.unselect = fns.unselect || function() {};
    this.stateChange = fns.stateChange || function() {}; // arbitrary state change happened -- redraw tool state if necessary
  }
  var pencil = new Tool({
    type: 'applier',
    calculateTiles: function(x,y) {
      return [tiles[x][y]];
    }
  });
  var brush = new Tool({
    type: 'applier',
    calculateTiles: function(x,y) {
      var calculated = [];
      for (var ix=x-1; ix<=x+1; ix++) {
        for (var iy=y-1; iy<=y+1; iy++) {
          if (ix>=0 && iy>=0 && ix<width && iy<height) {
            calculated.push(tiles[ix][iy]);
          }
        }
      }
      return calculated;
    }
  });
  var fill = new Tool({
    type: 'applier',
    calculateTiles: function(x,y) {
      var targetType = tiles[x][y].type;

//      if (targetType == brushTileType) {
//        // The brush matches the first tile, painting it would do nothing.
//        return [];
//      }

      var toChange = [ tiles[x][y] ];

      var changed = [ tiles[x][y] ];

      while (toChange.length > 0) {

        var tempToChange = [];

        toChange.forEach(function(tile) {
          for (var ix=tile.x-1; ix<=tile.x+1; ix++) {
            for (var iy=tile.y-1; iy<=tile.y+1; iy++) {
              if (Math.abs(tile.x-ix) + Math.abs(tile.y-iy) == 1&& ix>=0 && iy>=0 && ix<width && iy<height) {
                var test = tiles[ix][iy];
                if (test.type == targetType && $.inArray(test, changed) === -1) {
                  tempToChange.push(test);
                  changed.push(tiles[ix][iy]);
                }
              }
            }
          }
        });
        toChange = tempToChange;
      }

      return changed;
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
    down: function(x,y) {
      var tile = tiles[x][y];
      if (tile.type == portalType) {
        if (this.selectedSwitch && this.selectedSwitch.type == portalType) {
          mayHaveChanged(this.selectedSwitch);
          this.selectedSwitch.destination = tile;
          this.selectedSwitch = null;
        } else {
          this.selectedSwitch = tile;
        }
        this.refreshHighlights();
      } else if (tile.type == switchType) {
        this.selectedSwitch = tile;
        this.refreshHighlights();
      } else if (this.selectedSwitch && this.selectedSwitch.type == switchType) {
        var affected = this.selectedSwitch.affected || ( this.selectedSwitch.affected={});
        var key = x + ',' + y;
        if (affected[key]) {
          delete affected[key]
          tile.highlight(false);
        } else {
          affected[key] = tile;
          tile.highlight(true);
        }
        mayHaveChanged(this.selectedSwitch);
      }
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

  function Point(source) {
    this.x = source.x;
    this.y = source.y;
  }
  Point.cmp = function(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    if (a.x != b.x) return a.x - b.x;
    return a.y - b.y;
  }
  function TileState(source) {
    this.x = source.x;
    this.y = source.y;
    this.type = source.type;
    this.affected = [];
    for (var key in source.affected||{}) {
      this.affected.push(new Point(source.affected[key]));
    }
    this.affected.sort(Point.cmp);
    this.destination = source.destination && new Point(source.destination);
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
    }
  }

  function moveChange(fromSteps, toSteps) {
    if (!fromSteps.length) return;

    var step = fromSteps.splice(fromSteps.length-1, 1)[0];
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
    var step = recordStep();
    if (step) {
      toSteps.push(step);
    }

    cleanDirtyWalls();
    if (selectedTool) selectedTool.stateChange();
  }

  function undo() {
    moveChange(undoSteps, redoSteps);
  }
  function redo() {
    moveChange(redoSteps, undoSteps);
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

  var floorType, emptyType, wallType, blueFlagType, redFlagType, switchType, bombType, onFieldType, offFieldType, redFieldType, blueFieldType, portalType;
  var tileTypes = [
    floorType = new TileType('floor', 2,2, 212,212,212),
    emptyType = new TileType('empty', 0,1, 0,0,0),
    wallType = new TileType('wall', 0,0, 120,120,120),
    switchType = new TileType('switch', 2,5, 185,122,87, {logicFn: exportSwitch}),
    new TileType('spike', 2,3, 55,55,55),
    bombType=new TileType('bomb', 6,5, 255,128,0),
    new TileType('powerup', 7,8, 0,255,0),
    new TileType('speedpad', 0,0, 255,255,0, {image: 'speedpad'}),
    new TileType('blueSpeedpad', 0,0, 115,115,255, {image: 'speedpadblue'}),
    new TileType('redSpeedpad', 0,0, 255,115,115, {image: 'speedpadred'}),
    new TileType('redFloor', 3,1, 220,186,186),
    new TileType('blueFloor', 3,2 , 187,184,221),
    offFieldType = new TileType('offField', 10,1, 0,117,0, {logicFn: setFieldFn('off')}),
    onFieldType = new TileType('onField', 10,2, 0,117,0, {logicFn: setFieldFn('on')}),
    redFieldType = new TileType('redField', 10,3, 0,117,0, {logicFn: setFieldFn('red')}),
    blueFieldType = new TileType('blueField', 10,4, 0,117 ,0, {logicFn: setFieldFn('blue')}),
    portalType = new TileType('portal', 0,0, 202, 192, 0, {image: 'portal', logicFn: exportPortal}),
    redFlagType = new TileType('redFlag', 8,0, 255,0,0),
    blueFlagType = new TileType('blueFlag', 9,0, 0,0,255)
  ]

  function Tile(options, elem) {
    this.set(options);
    if (elem) {
      this.elem = elem;
      this.setType(options.type, true);
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
    return tiles[x] && tiles[x][y] && tiles[x][y].type == wallType;
  }
  function maybeIsDirtyWall(x, y) {
    if (isWall(x,y)) dirtyWalls[x + ',' + y] = tiles[x][y];
  }
  function cleanDirtyWalls() {
    for (var key in dirtyWalls) {
      var wall = dirtyWalls[key];
      if (wall.type != wallType) continue;

      wall.type.drawOn(wall.elem, wall);
    }
    dirtyWalls = {};
  }

  var $map = $('#map');
  var $palette = $('#palette');

  var brushTileType = tileTypes[0];

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
      row += "<div class='tileBackground'><div class='tile'><div class='selectionIndicator'></div><div class='potentialHighlight'></div></div></div>";
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
  }

  (function() {
    var emptyTypes = [];
    for (var x=0;x<20;x++) {
      var col = emptyTypes[x] = [];
      for (var y=0; y<20; y++) {
        col.push(floorType)
      }
    }
    buildTilesWith(emptyTypes);
    $('#mapName').val('Untitled');
    $('#author').val('Anonymous');
  })();

  var selectedTool = pencil;
  $('#toolPencil').addClass('selectedTool');

  var symmetry = 'None';
  var $symmetryRadios = $('input:radio[name=symmetry]');
  if ($symmetryRadios.is(':checked') === false) {
    $symmetryRadios.filter('[value=None]').prop('checked', true);
  }

  $symmetryRadios.click(function() {
    console.log('Symmetry was ', symmetry);
    var selectedSymmetry = $('input:radio[name=symmetry]:checked');
    if (selectedSymmetry.length > 0) {
      symmetry = selectedSymmetry.val();
    }
    console.log('Symmetry is ', symmetry);
  });

  var potentialTiles = [];

  function applyPotentials() {
    $.each(potentialTiles, function(key, tile) {
      tile.setType(brushTileType);
    });
    cleanDirtyWalls();
  }

  function setPotentials(tiles) {
    //console.log('Setting potentials', tiles);
    potentialTiles = tiles;
    $.each(potentialTiles, function(key, tile) {
      tile.highlightWithPotential(true);
    });
  }
  $map.mouseleave(function(e) {
    console.log('map left');
  });

  var controlDown = false;

  $(document).keydown(function(e) {
    if(e.which=="17") {
      console.log('control down');
      controlDown = true;
    }
  }).keyup(function(e) {
      if (e.which=="17") {
        console.log('control up');
        controlDown = false;
      }
  });

  var mouseDown = false;
  $map.on('mouseenter', '.tile', function(e) {

    var x = $(this).data('x');
    var y = $(this).data('y');

    if (!selectedTool) return;

    if (selectedTool.type == 'applier' && selectedTool.calculateTiles != function(){} ) {
      var potentials = [];
      potentials = selectedTool.calculateTiles.call(selectedTool, x,y);
      if (symmetry == 'Horizontal') {
        var toBeMerged = selectedTool.calculateTiles.call(selectedTool, width - x - 1, y);
        $.merge(potentials, toBeMerged);
      }
      if (symmetry == 'Vertical') {
       $.merge(potentials, selectedTool.calculateTiles.call(selectedTool, x, height-y-1));
      }
      if (symmetry == '4-Way') {
       $.merge(potentials, selectedTool.calculateTiles.call(selectedTool, width-x-1, y));
       $.merge(potentials, selectedTool.calculateTiles.call(selectedTool, x, height-y-1));
       $.merge(potentials, selectedTool.calculateTiles.call(selectedTool, width-x-1, height-y-1));
      }
      if (symmetry == 'Rotational') {
        $.merge(potentials, selectedTool.calculateTiles.call(selectedTool, width-x-1, height-y-1));
      }

      setPotentials(potentials);
//      console.log(x, y, potentialTiles);
      if (mouseDown) {
        applyPotentials();
      }
    }
//      console.log('mouse entered ', $(this).data('x'), $(this).data('y'));
    })
    .on('mouseleave', '.tile', function(e) {
      potentialTiles = [];
      clearPotentialHighlights();
//      console.log('mouse left ', $(this).data('x'), $(this).data('y'));
    })
    .on('mousedown', '.tile', function(e) {
      if (e.which==1) {
        if (!controlDown) {
          mouseDown = true;
    //      selectedTool.down.call(selectedTool, x,y);
    //      selectedTool.drag.call(selectedTool, x,y);
          if (selectedTool.type == 'applier') {
            applyPotentials();
          } else if (selectedTool.type == 'special') {
            var x = $(this).data('x');
            var y = $(this).data('y');
            selectedTool.down.call(selectedTool, x,y);
            selectedTool.drag.call(selectedTool, x,y);
          }
          e.preventDefault();
        }
      }
    })
    .on('mousemove', '.tile', function() {
      if (selectedTool && selectedTool.type == 'special') {
        var x = $(this).data('x');
        var y = $(this).data('y');
        selectedTool.drag.call(selectedTool, x,y);
        cleanDirtyWalls();
      }
    })
    .on('mouseup', '.tile', function(e) {
      if (e.which==1) {
        if (controlDown) {
          var x = $(this).data('x');
          var y = $(this).data('y');
          var eyeDropBrushType = tiles[x][y].type;
          setBrushTileType(eyeDropBrushType);
        } else {
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
    return 'data:image/png;base64,' + Base64.encode(generatePng(width, height, createPng()));
  }

  $('#export').click(function() {
    $('.dropArea').removeClass('hasImportable');
    $('.dropArea').addClass('hasExportable');
    $(jsonDropArea).attr('href', 'data:application/json;base64,' + Base64.encode(JSON.stringify(makeLogic())));
    $(pngDropArea).attr('href', getPngBase64());
  });

  $('#save').click(function() {
    localStorage.setItem('png', getPngBase64());
    localStorage.setItem('json', JSON.stringify(makeLogic()));
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

  $.each(tileTypes, function(idx, type) {
    var $button = $("<div class='tileBackground tilePaletteOption'><div class='tile'><div class='tileTypeSelectionIndicator'></div></div></div>");
    $button.data('tileType', type);
    type.drawOn($button.find('.tile'));
    $button.click('click', function() {
      setBrushTileType(type);
    });
    $palette.append($button);
  });

  $('.tileTypeSelectionIndicator:first').css('display', 'inline-block');

  $('#toolPencil').data('tool', pencil);
  $('#toolBrush').data('tool', brush);
  $('#toolFill').data('tool', fill);
  $('#toolWire').data('tool', wire);
  $('.toolButton').click(function() {
    selectedTool.unselect.call(selectedTool);
    $('.toolButton').removeClass('selectedTool');
    $(this).addClass('selectedTool');
    selectedTool = $(this).data('tool');
    selectedTool.select.call(selectedTool);
    potentialTiles = [];
  })

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
  function restoreFromPngAndJson(pngBase64, jsonString, optWidth, optHeight) {
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
    }
    img.src = pngBase64;//'https://mdn.mozillademos.org/files/5397/rhino.jpg';
  }

  $('#import').click(function() {
    if (importPng && importJson) {
      restoreFromPngAndJson(
        importPng,
        importJson);
    } else {
      alert('Please drag and drop a PNG and a JSON to import onto their receptacles.')
    }
  });

  function resizeTo(width, height) {
    var png = getPngBase64();
    var json = JSON.stringify(makeLogic());

    restoreFromPngAndJson(png, json, width, height);
  }

  $('#resize').click(function() {
    var width = parseInt($('#resizeWidth').val(), 10);
    var height = parseInt($('#resizeHeight').val(), 10);
    resizeTo(width, height);
  });

  var savedPng = localStorage.getItem('png')
  var savedJson = localStorage.getItem('json')
  restoreFromPngAndJson(savedPng, savedJson);
});
