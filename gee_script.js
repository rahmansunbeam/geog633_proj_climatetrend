// This GEE script uses the ESA WorldCover dataset and the NASA GDDP-CMIP6 dataset and produces
// a timeseries chart of mean temperature for each land cover class for a given point on the map.
// The script is intended to be used in the Google Earth Engine Code Editor. 
// This script was created for the purpose of the project for GEOG633 of MGIS, Win 2024, University of Calgary


// Author: Sunbeam Rahman
// Date: 2024-01-27
// email: sunbeam.rahman@ucalgary.ca

var image_worldcover = ee.ImageCollection("ESA/WorldCover/v200");
var image_cmip6 = ee.ImageCollection("NASA/GDDP-CMIP6");


// Load the ESA WorldCover dataset (version 200)
var worldCover = image_worldcover.first();

var calculateEmissionStats = function(point) {

  var startDate = ee.Date('2000-01-01'); 
  var endDate = ee.Date('2023-12-31'); 
  var variable = 'tas';

  var buffer = point.buffer(10000); 
  
  var landcoverWithinBuffer = worldCover.clip(buffer);
  
  var startYear = startDate.get('year');
  var endYear = endDate.get('year');
  var years = ee.List.sequence(startYear, endYear);

  var yearlyMeans = years.map(function(year){
      var startDateOfYear = ee.Date.fromYMD(year, 1, 1);
      var endDateOfYear = ee.Date.fromYMD(year, 12, 31);
      var cmip6Year = image_cmip6
          .filterDate(startDateOfYear, endDateOfYear)
          .filter(ee.Filter.eq('model', 'CanESM5'))
          .select([variable])
          .mean()
          .addBands(landcoverWithinBuffer)
          .clip(buffer);
      return cmip6Year.set('year', year);
  });
  
  var landCoverClasses = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];

  var zonalStats = yearlyMeans.map(function(image) {
    image = ee.Image(image)
    return landCoverClasses.map(function(landCoverClass) {
        var mask = image.select('Map').eq(landCoverClass);
        var meanval = image.updateMask(mask)
              .select(variable)
              .reduceRegion({
                  reducer: ee.Reducer.mean(),
                  geometry: image.geometry(),
                  scale: 100,
                  maxPixels: 1e9
              }).get(variable);
        var count = image.updateMask(mask)
            .reduceRegion({
                reducer: ee.Reducer.count(),
                geometry: image.geometry(),
                scale: 100,
                maxPixels: 1e9
            }).get('Map');
        return {'landCoverClass': landCoverClass, 'mean': meanval, 'count': count, 'year': ee.String(ee.Number(image.get('year')).toInt())};
    });
  }).flatten();
  
  // Convert zonalStats to a feature collection
  var zonalStatsFc = ee.FeatureCollection(zonalStats.map(function(dict) {
    return ee.Feature(null, dict);
  }));
  
  // Create a chart
  var chart = ui.Chart.feature.groups({
      features: zonalStatsFc,
      xProperty: 'year',
      yProperty: 'mean',
      seriesProperty: 'landCoverClass'
  })
  .setChartType('LineChart')
  .setOptions({
      title: 'Mean temperature by Year for each Land cover class',
      hAxis: {title: 'Year'},
      vAxis: {title: 'Mean Temperature'},
      lineWidth: 1,
      pointSize: 3
  });
  
  // Print the chart
  print(chart);

}

// Event handler for mouse click
Map.onClick(function(event) {
  var clickedPoint = ee.Geometry.Point(event.lon, event.lat);
  
  // Calculate emission statistics for the area within the buffer around the clicked point
  var stats = calculateEmissionStats(clickedPoint);
  
  Map.addLayer(stats, ['006400'], 'from click event - ESA');
  // Map.addLayer(stats, {min: 240, max: 340, palette: ['blue', 'purple', 'cyan', 'green', 'yellow', 'red']}, 'from click event - cmip6');
  
  // Display trend line or other visualization of emission statistics
  // (You can use ui.Chart or other visualization methods here)
});

// Adding palette for WorldCover
var palette = ee.List(worldCover.get('Map_class_palette'))

// Set the visualization parameters
var visParams = {
  palette: palette[0]
};

// Add the ESA WorldCover dataset with the custom palette and labels to the map
Map.addLayer(worldCover, visParams, 'ESA WorldCover v200');

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
    fontSize: '18px',
    margin: '0 0 4px 0',
    padding: '0'
  }
});

// Add the title to the panel
legend.add(legendTitle);

// // Add a legend of the land cover classes
// var landCoverLabels = ee.List(worldCover.get('Map_class_names'))

// for (var i = 0; i < palette.length().getInfo(); i++) {
//   var colorBox = ui.Label({
//     style: {
//       backgroundColor: '#' + palette.get(i).getInfo(),
//       padding: '8px',
//       margin: '0 6px 0 0' // Adjust margin for spacing between color box and label
//     }
//   });
  
//   var description = ui.Label({
//     value: landCoverLabels.get(i).getInfo(),
//     style: {
//       margin: '0', // Remove bottom margin
//       fontSize: '14px' // Adjust font size as needed
//     }
//   });

//   var item = ui.Panel({
//     widgets: [colorBox, description],
//     layout: ui.Panel.Layout.Flow('horizontal') // Arrange color box and label horizontally
//   });

//   legend.add(item);
// }

// // Add legend to map
// Map.add(legend);
