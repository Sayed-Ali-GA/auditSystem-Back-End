const jwt = require("jsonwebtoken");


const isAdmin = (req, res, next) => {

    console.log("USER FROM TOKEN:");
    console.log(req.user);

    console.log("ROLE:");
    console.log(req.user.RoleID);
    console.log(typeof req.user.RoleID);


    if (Number(req.user.RoleID) !== 1) {
        console.log("BLOCKED BY ADMIN CHECK");

        return res.status(403).json({
            message: "Access denied."
        });
    }


    console.log("ADMIN PASSED ✅");

    next();
};


module.exports = isAdmin;