This is my first attempt at making any container.  As a mechanical engineer, I figured I'd try something that I know how to calculate.  This is a relatively simple heat exchanger calculator.  And by simple, I mean very basic and probably not what you'd actually find in an industrial application due to it's academic design:

Components:
  A pipe with annular fins withn uniforn wall thickness and spacing.
  A duct for cross-flow air.
  Some thermodynamic and fluid power calculations.

Input parameters:
  You can change quite a few things including the liquid going into the Hx, it's volumetric flow rate and temperature.  The air side is also something you can control in a similar fashion.  Here I have it set as velocity.  Depending on the viscosity of the liquid, an impellor or positive displacement pump will be automatically selected with a typical efficiency that you can tweak.  You can also change the geometry of the pipe ID, wall thickness, length, fin OD, fin wall, fin OD, and specify how much larger in % the duct is than the OD of the fins.  Metric & imperial units are selectable too.

  This is mostly for educational purposes for me of how to create some code and deploy it.  Yes, I used Gemini Argon to fully create the Python and JS code.  I am not a coder.  But I questioned the physics and results.  However as a quick and dirty exercise for getting something off the ground, there are probably some errors and this should definitely not be used for production.
