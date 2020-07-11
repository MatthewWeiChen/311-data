import React, { Component } from 'react';
import mapboxgl from 'mapbox-gl';
import { connect } from 'react-redux';
import PropTypes from 'proptypes';
import { getPinInfoRequest } from '@reducers/data';
import { updateMapPosition } from '@reducers/ui';
import ncBoundaries from '../../data/nc-boundary-2019.json';
//import openRequests from '../../data/open_requests.json';
import { REQUEST_TYPES } from '@components/common/CONSTANTS';
import geojsonExtent from '@mapbox/geojson-extent';
import * as turf from '@turf/turf';
// import MapCharts from './MapCharts';
// import MapLayers from './MapLayers';
import MapSearch from './MapSearch';
// import MapRequestFilters from './MapRequestFilters';

/////////////////// CONSTANTS ///////////////

mapboxgl.accessToken = process.env.MAPBOX_TOKEN;

const REQUEST_COLORS = Object.keys(REQUEST_TYPES).reduce((p, c) => {
  return [...p, c, REQUEST_TYPES[c].color]
}, []);

const ZOOM_OUT_EXTENT = geojsonExtent(ncBoundaries);

///////////////////// MAP ///////////////////

function BoundaryLayer({ map, sourceId, sourceData, idProperty, onSelectRegion }) {
  let hoveredRegionId = null;

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
      'line-width': 0.5
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
      'fill-color': '#627BC1',
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        0.5,
        0
      ]
    }
  });

  map.on('mousemove', `${sourceId}-fills`, e => {
    if (map.loaded()) {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [`${sourceId}-fills`]
      });

      map.getCanvas().style.cursor = features.length ? 'pointer' : '';

      if (features.length) {
        const { id } = features[0];
        if (id === hoveredRegionId)
          return;

        if (hoveredRegionId) {
          map.setFeatureState(
            { source: sourceId, id: hoveredRegionId },
            { hover: false }
          );
        }
        map.setFeatureState(
          { source: sourceId, id },
          { hover: true }
        );

        hoveredRegionId = id;
      }
    }
  });

  map.on('mouseleave', `${sourceId}-fills`, () => {
    if (hoveredRegionId) {
      map.setFeatureState(
        { source: sourceId, id: hoveredRegionId },
        { hover: false }
      );
      hoveredRegionId = null;
    }
  });

  map.on('click', `${sourceId}-fills`, e => {
    const { id } = map.queryRenderedFeatures(e.point, {
      layers: [`${sourceId}-fills`]
    })[0];

    const geo = sourceData.features.find(el => el.properties[idProperty] === id);
    map.fitBounds(geojsonExtent(geo), { padding: 50 });
    onSelectRegion(geo)
  });

  return {
    show: () => {
      map.setLayoutProperty(`${sourceId}-borders`, 'visibility', 'visible');
      map.setLayoutProperty(`${sourceId}-fills`, 'visibility', 'visible');
    },
    hide: () => {
      map.setLayoutProperty(`${sourceId}-borders`, 'visibility', 'none');
      map.setLayoutProperty(`${sourceId}-fills`, 'visibility', 'none');
    },
  }
}

class PinMap extends Component {
  constructor(props) {
    super(props);

    this.state = {
      hoveredNCId: null,
      selectedNCId: null,
      requests: this.convertRequests(),
      mapReady: false
    };

    this.map = null;

    this.center = null;

    this.ncLayer = null;
  }

  componentDidMount() {
    this.map = new mapboxgl.Map({
      container: this.mapContainer,
      style: 'mapbox://styles/mapbox/dark-v10',
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: false
    });

    this.zoomOut(false);
    this.updatePosition(this.map);

    this.map.touchZoomRotate.enable();
    this.map.touchZoomRotate.disableRotation();

    this.map.on('load', () => {
      this.map.on('moveend', e => {
        this.updatePosition(this.map);
      });

      this.addRequests(this.map);
      this.addShed(this.map);

      this.ncLayer = BoundaryLayer({
        map: this.map,
        sourceId: 'nc',
        sourceData: ncBoundaries,
        idProperty: 'nc_id',
        onSelectRegion: geo => this.setState({ filterPolygon: geo })
      });
    });

    this.setState({ mapReady: true })
  }

  componentDidUpdate(prevProps) {
    if (this.props.pinClusters !== prevProps.pinClusters) {
      const requests = this.convertRequests();
      this.setState({ requests });

      const source = this.map.getSource('requests');
      if (source)
        source.setData(requests);
    }
  }

  addRequests = map => {
    map.addSource('requests', {
      type: 'geojson',
      data: this.state.requests
    });

    map.addLayer({
      id: 'requests',
      type: 'circle',
      source: 'requests',
      paint: {
        'circle-radius': {
          'base': 1.75,
          'stops': [
            [12, 2],
            [22, 180]
          ],
        },
        'circle-color': [
          'match',
          ['get', 'type'],
          ...REQUEST_COLORS,
          '#FFFFFF'
        ],
        'circle-opacity': 0.8
      },
      // filter: this.filters(this.props)
    });
    //
    // map.addLayer({
    //   id: 'clusters',
    //   type: 'circle',
    //   source: 'requests',
    //   filter: ['>', ['get', 'point_count'], 1],
    //   paint: {
    //     'circle-color': [
    //       'step',
    //       ['get', 'point_count'],
    //       '#51bbd6', 100,
    //       '#f1f075', 750,
    //       '#f28cb1'
    //     ],
    //     'circle-radius': [
    //       'step',
    //       ['get', 'point_count'],
    //       10, 100,
    //       20, 750,
    //       30
    //     ]
    //   }
    // });
    //
    // map.addLayer({
    //   id: 'cluster-count',
    //   type: 'symbol',
    //   source: 'requests',
    //   filter: ['>', ['get', 'point_count'], 1],
    //   layout: {
    //     'text-field': '{point_count}',
    //     'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
    //     'text-size': 12,
    //   }
    // });
  };

  addShed = map => {
    let offset;
    this.center = map.getCenter();
    let circle = turf.circle([this.center.lng, this.center.lat], 1, { units: 'miles' });
    this.setState({ filterPolygon: circle });

    var canvas = map.getCanvasContainer();

    const onMove = e => {
      canvas.style.cursor = 'grabbing';

      const { lng, lat } = e.lngLat;
      this.center = {
        lng: lng - offset.lng,
        lat: lat - offset.lat
      }
      circle = turf.circle([this.center.lng, this.center.lat], 1, { units: 'miles' });

      // this.setState({ filterPolygon: circle });
      map.getSource('shed').setData(circle);
    }

    const onUp = e => {
      const { lng, lat } = e.lngLat;
      this.center = {
        lng: lng - offset.lng,
        lat: lat - offset.lat
      }
      circle = turf.circle([this.center.lng, this.center.lat], 1, { units: 'miles' });

      this.setState({ filterPolygon: circle });
      map.getSource('shed').setData(circle);

      canvas.style.cursor = '';
      map.off('mousemove', onMove);
      map.off('touchmove', onMove);
    }

    map.addSource('shed', {
      'type': 'geojson',
      'data': circle
    });

    map.addLayer({
      'id': 'shed-border',
      'type': 'line',
      'source': 'shed',
      layout: {
        visibility: 'visible'
      },
      'paint': {
        'line-width': 1.5,
        'line-color': '#FFFFFF'
      }
    });

    map.addLayer({
      'id': 'shed-fill',
      'type': 'fill',
      'source': 'shed',
      layout: {
        visibility: 'visible'
      },
      'paint': {
        'fill-color': 'transparent',
        'fill-opacity': 0.2
      }
    });

    //When the cursor enters a feature in the point layer, prepare for dragging.
    map.on('mouseenter', 'shed-fill', e => {
      map.setPaintProperty('shed-fill', 'fill-color', '#FFFFFF');
      canvas.style.cursor = 'move';
    });

    map.on('mouseleave', 'shed-fill', e => {
      map.setPaintProperty('shed-fill', 'fill-color', 'transparent');
      canvas.style.cursor = '';
    });

    map.on('mousedown', 'shed-fill', e => {
      // Prevent the default map drag behavior.
      e.preventDefault();

      canvas.style.cursor = 'grab';

      offset = {
        lng: e.lngLat.lng - this.center.lng,
        lat: e.lngLat.lat - this.center.lat,
      };

      map.on('mousemove', onMove);
      map.once('mouseup', onUp);
    });

    map.on('touchstart', 'shed-fill', e => {
      if (e.points.length !== 1) return;

      // Prevent the default map drag behavior.
      e.preventDefault();

      map.on('touchmove', onMove);
      map.once('touchend', onUp);
    });
  };

  onGeocoderResult = ({ result }) => {
    if (result.properties.type === 'nc')
      return this.zoomToNC(result.id);

    this.center = {
      lng: result.center[0],
      lat: result.center[1]
    };

    const circle = turf.circle([this.center.lng, this.center.lat], 1, { units: 'miles' });

    this.setState({ filterPolygon: circle });
    this.map.getSource('shed').setData(circle);
    this.zoomTo(circle);
  }

  onChangeSearchTab = tab => {
    switch(tab) {
      case 'address':
        this.ncLayer.hide();

        this.map.setLayoutProperty('shed-border', 'visibility', 'visible');
        this.map.setLayoutProperty('shed-fill', 'visibility', 'visible');
        break;

      case 'nc':
        this.map.setLayoutProperty('shed-border', 'visibility', 'none');
        this.map.setLayoutProperty('shed-fill', 'visibility', 'none');

        this.ncLayer.show();
        break;
    }

    this.zoomOut();
  }

  activeTypes = props => {
    const active = [];
    props.requestTypes.forEach((t, idx) => {
      if (t.active)
        active.push(idx);
    });
    return active;
  }

  typeFilter = props => {
    return ['in', ['number', ['get', 'type']], ['literal', this.activeTypes(props)]];
  }

  startDateFilter = props => {
    return [">=", ['number', ['get', 'date']], props.startDate];
  }

  endDateFilter = props => {
    return ["<=", ['number', ['get', 'date']], props.endDate];
  }

  filters = props => [
    'all',
    this.typeFilter(props),
    this.startDateFilter(props),
    this.endDateFilter(props)
  ]

  convertRequests = () => ({
    "type": "FeatureCollection",
    "features": this.props.pinClusters.map(cluster => ({
      "type": "Feature",
      "properties": {
        id: cluster.srnumber,
        type: cluster.requesttype,
        point_count: cluster.count
      },
      "geometry": {
        "type": "Point",
        "coordinates": [
          cluster.longitude,
          cluster.latitude
        ]
      }
    }))
  });

  updatePosition = map => {
    const { updatePosition } = this.props;
    const bounds = map.getBounds();
    const zoom = map.getZoom();
    updatePosition({
      zoom,
      bounds: {
        _northEast: bounds.getNorthEast(),
        _southWest: bounds.getSouthWest(),
      },
    });
  }

  zoomToNC = id => {
    const ncGeo = ncBoundaries.features.find(el => el.properties.nc_id == id);
    this.zoomTo(ncGeo);
    return ncGeo;
  }

  zoomTo = (geojson) => {
    this.map.fitBounds(geojsonExtent(geojson), { padding: 50 });
  }

  zoomOut = (animate=true) => {
    this.map.fitBounds(ZOOM_OUT_EXTENT, { padding: 50, linear: true, animate });
  }

  export = () => {
    console.log(map.getCanvas().toDataURL());
  }

  hoveredNCName = () => {
    const { hoveredNCId } = this.state;

    if (!hoveredNCId)
      return null;

    const nc = ncBoundaries.features.find(el => el.properties.nc_id === hoveredNCId);

    return nc.properties.name;
  }

  //// RENDER ////

  render() {
    const ncName = this.hoveredNCName();
    return (
      <div className="map-container">
        {/*<MapCharts
          requests={this.state.requests}
          filterPolygon={this.state.filterPolygon}
        />*/}
        {/*<MapLayers />*/}
        {
          this.state.mapReady ?
            <MapSearch
              map={this.map}
              onGeocoderResult={this.onGeocoderResult}
              onChangeTab={this.onChangeSearchTab}
            /> :
            null
        }
        {/*<MapRequestFilters />*/}
        <div style={{
          position: 'absolute',
          zIndex: 1,
          bottom: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: 5,
          border: '1px white solid',
          backgroundColor: 'black',
          color: 'white'
        }}>
          { this.props.position.zoom && this.props.position.zoom.toFixed(4) }
        </div>
        <div style={{
          display: ncName ? 'block' : 'none',
          position: 'absolute',
          zIndex: 1,
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: 5,
          border: '1px white solid',
          backgroundColor: 'black',
          color: 'white'
        }}>
          { ncName }
        </div>
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0
        }} ref={el => this.mapContainer = el} />
      </div>
    );
  }
}

const mapDispatchToProps = dispatch => ({
  getPinInfo: srnumber => dispatch(getPinInfoRequest(srnumber)),
  updatePosition: position => dispatch(updateMapPosition(position)),
  exportMap: () => dispatch(trackMapExport()),
});

const mapStateToProps = state => ({
  pinsInfo: state.data.pinsInfo,
  // pinClusters: state.data.pinClusters,
  //pinClusters: openRequests,
  pinClusters: [],
  heatmap: state.data.heatmap,
  position: state.ui.map
});

PinMap.propTypes = {
  pinsInfo: PropTypes.shape({}),
  pinClusters: PropTypes.arrayOf(PropTypes.shape({})),
  heatmap: PropTypes.arrayOf(PropTypes.array),
  getPinInfo: PropTypes.func.isRequired,
  updatePosition: PropTypes.func.isRequired,
  exportMap: PropTypes.func.isRequired,
};

PinMap.defaultProps = {
  pinsInfo: {},
  pinClusters: [],
  heatmap: [],
};

export default connect(mapStateToProps, mapDispatchToProps)(PinMap);
