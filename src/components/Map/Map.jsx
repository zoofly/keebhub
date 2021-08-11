import React from "react";
import { withScriptjs, withGoogleMap, GoogleMap, Marker,} from "react-google-maps";

function Map() {
  return (
    <GoogleMap
      defaultZoom={10}
      defaultCenter={{ lat: 44.989714, lng: -93.267567 }}
    />
  );
}

const WrappedMap = withScriptjs(withGoogleMap(Map));

export default function Mapping() {
  return (
    <div style={{ width: "1000px", height: "500px" }}>
      <WrappedMap
        googleMapURL={`https://maps.googleapis.com/maps/api/js?v=3.exp&libraries=geometry,drawing,places&key=`}
        loadingElement={<div style={{ height: `100%` }} />}
        containerElement={<div style={{ height: `95%` }} />}
        mapElement={<div style={{ height: `100%` }} />}
      />
    </div>
  );
}