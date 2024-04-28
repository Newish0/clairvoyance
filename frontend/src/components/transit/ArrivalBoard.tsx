



import React from "react";
import useStops from "./hooks/transit";

type ArrivalBoardProps = {
  lat: number | string;
  lng: number | string;
};

const ArrivalBoard: React.FC<ArrivalBoardProps> = ({ lat, lng }) => {
  const { data: stops } = useStops({ lat, lng, radius: 0.5 });

  return (
    <div>
      {stops?.map((stop) => (
        <div key={stop.stop_id}>{stop.stop_name}</div>
      ))}
    </div>
  );
};

export default ArrivalBoard;
