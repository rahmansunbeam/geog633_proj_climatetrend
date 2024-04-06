// This GEE script uses the ESA WorldCover dataset and the NASA GDDP-CMIP6 dataset and produces
// a timeseries chart of mean temperature for each land cover class for a given point on the map.
// The script is intended to be used in the Google Earth Engine Code Editor.
// This script was created for the final project of GEOG633 - Research & Appl In Remote Sensing
// MGIS, Winter 2024, University of Calgary

// Author: Sunbeam Rahman, MGIS Student, University of Calgary
// Date: 01 April, 2024
// email: sunbeam.rahman@ucalgary.ca

// Specifications for WorldCover dataset
// 10 - Tree cover, 20 - Shrubland, 30 - Grassland, 40 - Cropland, 50 - Built-up
// 60 - Bare / sparse vegetation, 70 - Snow and ice, 80 - Permanent water bodies
// 90 - Herbaceous wetland, 95 - Mangroves, 100 - Moss and lichen

// import the WorldCover and CMIP6 datasets
var image_worldcover = ee.ImageCollection("ESA/WorldCover/v200");
var image_cmip6 = ee.ImageCollection("NASA/GDDP-CMIP6");

// add necessary specifications
var startDate = ee.Date('1990-01-01');
var endDate = ee.Date('2023-12-31');
var landCoverClasses = [30, 40, 50];
var variable = 'tas';
var model = 'CanESM5';
var bufferScale = 10000;

var calculateEmissionStats = function(point) {

  // get the lat and lon of the clicked location
  var pointLat = ee.Number(point.coordinates().get(1)).format('%.4f');
  var pointLon = ee.Number(point.coordinates().get(0)).format('%.4f');

  // create the buffer area
  var buffer = point.buffer(bufferScale);
  var years = ee.List.sequence(startDate.get('year'), endDate.get('year'));

  // Calculate yearly means for the given model and variable
  var yearlyMeans = years.map(function(year){
    var startDateOfYear = ee.Date.fromYMD(year, 1, 1);
    var endDateOfYear = ee.Date.fromYMD(year, 12, 31);
    var cmip6Year = image_cmip6
      .filterDate(startDateOfYear, endDateOfYear)
      .filter(ee.Filter.eq('model', model))
      .select([variable])
      .mean()
      .addBands(image_worldcover.first())
      .clip(buffer);
    return cmip6Year.set('year', year);
  });

  // Calculate zonal statistics for each land cover class
  var zonalStats = yearlyMeans.map(function(image) {
    image = ee.Image(image)
    return landCoverClasses.map(function(landCoverClass) {

        var mask = image.select('Map').eq(landCoverClass);

        // add reduceRegion for percentile
        var percentile = image.updateMask(mask)
              .select(variable)
              .reduceRegion({
                  reducer: ee.Reducer.percentile([95]),
                  geometry: image.geometry(),
                  scale: 100,
                  maxPixels: 1e9
              }).get(variable);

        // add mean
        var meanval = image.updateMask(mask)
              .select(variable)
              .reduceRegion({
                  reducer: ee.Reducer.mean(),
                  geometry: image.geometry(),
                  scale: 100,
                  maxPixels: 1e9
              }).get(variable);

        // add count
        var count = image.updateMask(mask)
            .reduceRegion({
                reducer: ee.Reducer.count(),
                geometry: image.geometry(),
                scale: 100,
                maxPixels: 1e9
            }).get('Map');

        return {'landCoverClass': landCoverClass, 'mean': meanval, 'percentile': percentile,'count': count, 'year': ee.Number(image.get('year')).toInt()};
    });
  }).flatten();

  // print(zonalStats)

  // Convert zonalStats to a feature collection
  var zonalStatsFc = ee.FeatureCollection(zonalStats.map(function(dict) {
    return ee.Feature(null, dict);
  }));

  // Create a chart
  var chart = ui.Chart.feature.groups({
      features: zonalStatsFc,
      xProperty: 'year',
      yProperty: 'mean', //percentile, mean
      seriesProperty: 'landCoverClass'
  })
  .setChartType('LineChart')
  .setOptions({
      title: 'Mean yearly temperature (K) per Land Cover class at ' + pointLat.getInfo() + ', ' + pointLon.getInfo(),
      hAxis: {title: 'Year', format: '####'},
      vAxis: {title: 'Mean temp/ year in K', format: '###'},
      lineWidth: 2,
      pointSize: 0,
      curveType: 'function',
      trendlines: {0: {type: 'linear', color: 'black', lineWidth: 2}}
  });

  // Print the chart
  print(chart);

  // finally add the buffered CMIP6 image to the map
  var lastYearImage = yearlyMeans.get(-1);
  Map.addLayer(ee.Image(lastYearImage).select(variable), cmip6VizParam, 'CMIP6 of ' + pointLat.getInfo() + ', ' + pointLon.getInfo());
}

// Event handler for mouse click
Map.onClick(function(event) {
  var clickedPoint = ee.Geometry.Point(event.lon, event.lat);
  calculateEmissionStats(clickedPoint);
});

// Adding palette for WorldCover
var palette = ee.List(image_worldcover.first().get('Map_class_palette'))

// Set the visualization parameters
var visParams = {
  palette: palette[0]
};

// Add the ESA WorldCover dataset with the custom palette and labels to the map
Map.addLayer(image_worldcover.first(), visParams, 'ESA WorldCover v200');

// Create a legend
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 15px',
    maxWidth: '300px' // Adjust the maximum width as needed
  }
});

// Create legend title
var legendTitle = ui.Label({
  value: 'Land cover classes',
  style: {
    fontWeight: 'bold',
    fontSize: '16px',
    margin: '0 0 4px 0',
    padding: '0'
  }
});

// Add the title to the panel
legend.add(legendTitle);

// Add a legend of the land cover classes
var landCoverLabels = ee.List(image_worldcover.first().get('Map_class_names'))

for (var i = 0; i < palette.length().getInfo(); i++) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: '#' + palette.get(i).getInfo(),
      padding: '8px',
      margin: '0 6px 0 0'
    }
  });

  var description = ui.Label({
    value: landCoverLabels.get(i).getInfo(),
    style: {
      margin: '0',
      fontSize: '14px'
    }
  });

  var item = ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });

  legend.add(item);
}

// Create legend title for CMIP6
var cmip6LegendTitle = ui.Label({
  value: 'Temperature (K)',
  style: {
    fontWeight: 'bold',
    fontSize: '16px',
    margin: '8px 0 4px 0',
    padding: '0'
  }
});

// Add the title to the CMIP6 legend panel
legend.add(cmip6LegendTitle);

var nSteps = 10
// Creates a color bar thumbnail image of color palette
function makeColorBarParams(genaPalette) {
  return {
    bbox: [0, 0, nSteps, 0.1],
    dimensions: '100x10',
    format: 'png',
    min: 0,
    max: nSteps,
    palette: genaPalette,
  };
}

// Create the colour bar for the legend
var colorBar = ui.Thumbnail({
  image: ee.Image.pixelLonLat().select(0).int(),
  params: makeColorBarParams(cmip6VizParam.palette),
  style: {stretch: 'horizontal', margin: '0px 8px', maxHeight: '24px'},
});

legend.add(colorBar);

// Create a panel with three numbers for the legend
var legendLabels = ui.Panel({
  widgets: [
    ui.Label(cmip6VizParam.min, {margin: '4px 8px'}),
    ui.Label(
        ((cmip6VizParam.max-cmip6VizParam.min) / 2+cmip6VizParam.min),
        {margin: '4px 8px', textAlign: 'center', stretch: 'horizontal'}),
    ui.Label(cmip6VizParam.max, {margin: '4px 8px'})
  ],
  layout: ui.Panel.Layout.flow('horizontal')
});

legend.add(legendLabels);

// Add CMIP6 legend to map
Map.add(legend);