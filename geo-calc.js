toDegrees = function(radians) {
    return radians * 180 / Math.PI;
};

//var oPoint1 = {
//    lat: 50.34578904827236,
//    lon: 30.422067940235138
//};
//
//var oPoint2 = {
//    lat: 50.34584553298622,
//    lon: 30.422157039366
//};
//
//var cPoint = {
//    lat: 50.34582670475571,
//    lon: 30.42198747396469
//};

function angleFromCoordinate(lat1, long1, lat2, long2) {
    var dLon = (long2 - long1);

    var y = Math.sin(dLon) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1)
        * Math.cos(lat2) * Math.cos(dLon);

    var brng = Math.atan2(y, x);

    brng = toDegrees(brng);
    brng = (brng + 360) % 360;
    //brng = 360 - brng;

    return brng;
}

function rotatePoint(pointToRotate, centerPoint, angleInDegrees) {
    var angleInRadians = angleInDegrees * (Math.PI / 180);
    var cosTheta = Math.cos(angleInRadians);
    var sinTheta = Math.sin(angleInRadians);
    return {
        lon: (cosTheta * (pointToRotate.lon - centerPoint.lon) -
                sinTheta * (pointToRotate.lat - centerPoint.lat) + centerPoint.lon),
        lat: (sinTheta * (pointToRotate.lon - centerPoint.lon) +
                    cosTheta * (pointToRotate.lat - centerPoint.lat) + centerPoint.lat)
    }
}

//var angle = angleFromCoordinate(oPoint1.lat, oPoint1.lon, oPoint2.lat, oPoint2.lon);
//
//console.log(angle);
//
//console.log(rotatePoint(cPoint, oPoint1, angle));
//console.log(rotatePoint(oPoint2, oPoint1, angle));

module.exports.angleFromCoordinate = angleFromCoordinate;
module.exports.rotatePoint = rotatePoint;