const { authenticateAccessToken } = require("../services/authSessionService");

const getAuthenticatedUserFromToken = async (token) => {
  const authResult = await authenticateAccessToken(token);
  return authResult.user;
};

const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      res.status(401);
      throw new Error("Not authorized, no token");
    }

    const authResult = await authenticateAccessToken(token);
    req.user = authResult.user;
    req.auth = {
      sessionId: authResult.session.sessionId,
      role: authResult.session.role,
      actorType: authResult.session.actorType,
    };

    next();
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(error.statusCode || 401);
    }
    next(error);
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    res.status(403);
    return next(new Error("Forbidden: insufficient permissions"));
  }

  next();
};

module.exports = {
  protect,
  authorize,
  getAuthenticatedUserFromToken,
};
