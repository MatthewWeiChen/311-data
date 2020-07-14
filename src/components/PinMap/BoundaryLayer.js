
import geojsonExtent from '@mapbox/geojson-extent';
import { mask as turfMask } from '@turf/turf';

export default function BoundaryLayer({
  map,
  sourceId,
  sourceData,
  idProperty,
  onSelectRegion,
  onHoverRegion,
}) {

  let hoveredRegionId = null;
  let selectedRegionId = null;

  map.addSource(sourceId, {
    type: 'geojson',
    data: sourceData,
    promoteId: idProperty
  });

  map.addLayer({
    id: `${sourceId}-borders`,
    source: sourceId,
    type: 'line',
    layout: {
      visibility: 'none'
    },
    paint: {
      'line-color': '#FFFFFF',
      'line-width': 2.0
    }
  });

  map.addLayer({
    id: `${sourceId}-fills`,
    source: sourceId,
    type: 'fill',
    layout: {
      visibility: 'none'
    },
    paint: {
      'fill-color': '#FFFFFF',
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        0.5,
        0
      ]
    }
  });

  map.addSource(`${sourceId}-region-mask`, {
    type: 'geojson',
    data: null,
  });

  map.addLayer({
    id: `${sourceId}-region-mask-fill`,
    source: `${sourceId}-region-mask`,
    type: 'fill',
    layout: {
      visibility: 'visible'
    },
    paint: {
      'fill-color': '#FFFFFF',
      'fill-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10, 0,
        13, 0.3
      ],
    }
  });

  map.on('mousemove', `${sourceId}-fills`, e => {
    if (map.loaded()) {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [`${sourceId}-fills`]
      });

      if (features.length) {
        const { id } = features[0];
        if (id === hoveredRegionId)
          return;

        onHoverRegion(features[0]);

        if (hoveredRegionId) {
          map.setFeatureState(
            { source: sourceId, id: hoveredRegionId },
            { hover: false }
          );
        }

        if (id !== selectedRegionId)
          map.setFeatureState(
            { source: sourceId, id },
            { hover: true }
          );

        hoveredRegionId = id;

        map.getCanvas().style.cursor = features.length ? 'pointer' : '';
      }
    }
  });

  map.on('mouseleave', `${sourceId}-fills`, () => {
    onHoverRegion(null);

    if (hoveredRegionId) {
      map.setFeatureState(
        { source: sourceId, id: hoveredRegionId },
        { hover: false }
      );
      hoveredRegionId = null;
    }
  });

  map.on('click', `${sourceId}-fills`, e => {
    const region = map.queryRenderedFeatures(e.point, {
      layers: [`${sourceId}-fills`]
    })[0];

    selectRegion(region.id);
  });

  const selectRegion = regionId => {
    if (regionId === selectedRegionId)
      return;

    if (selectedRegionId)
      map.setFeatureState(
        { source: sourceId, id: selectedRegionId },
        { selected: false }
      );

    selectedRegionId = regionId;

    map.setFeatureState(
      { source: sourceId, id: selectedRegionId },
      { selected: true, hover: false }
    );

    map.setPaintProperty(`${sourceId}-borders`, 'line-width', [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      2,
      0
    ]);

    // get the region geo
    // notice double-equals because id is a number when it comes from CONSTANTS,
    // but a string in the geojson
    const geo = sourceData.features.find(el => el.properties[idProperty] == selectedRegionId);

    // zoom to the region
    map.fitBounds(geojsonExtent(geo), { padding: 50 });

    // mask everything else
    map.getSource(`${sourceId}-region-mask`).setData(turfMask(geo));

    // inform main
    onSelectRegion(geo);
  }

  return {
    show: () => {
      map.setLayoutProperty(`${sourceId}-borders`, 'visibility', 'visible');
      map.setLayoutProperty(`${sourceId}-fills`, 'visibility', 'visible');
      map.setLayoutProperty(`${sourceId}-region-mask-fill`, 'visibility', 'visible');
    },

    hide: () => {
      map.setLayoutProperty(`${sourceId}-borders`, 'visibility', 'none');
      map.setLayoutProperty(`${sourceId}-fills`, 'visibility', 'none');
      map.setLayoutProperty(`${sourceId}-region-mask-fill`, 'visibility', 'none');
    },

    selectRegion: regionId => selectRegion(regionId),
    
    deselectAll: () => {
      if (selectedRegionId) {
        map.setFeatureState(
          { source: sourceId, id: selectedRegionId },
          { selected: false }
        );
        map.setPaintProperty(`${sourceId}-borders`, 'line-width', 2);
        map.getSource(`${sourceId}-region-mask`).setData({
          type: "FeatureCollection",
          features: []
        });
        selectedRegionId = null;
      }
    }
  }
}
