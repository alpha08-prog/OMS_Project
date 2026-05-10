import 'package:flutter/widgets.dart';

class GrievanceDonutPainter extends CustomPainter {
  final double resolved;
  final double inProgress;
  final double open;

  GrievanceDonutPainter({
    required this.resolved,
    required this.inProgress,
    required this.open,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final total = resolved + inProgress + open;
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width / 2) - 8;
    const stroke = 14.0;

    final bgPaint = Paint()
      ..color = const Color(0xFFF1F5F9)
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;
    canvas.drawCircle(center, radius, bgPaint);

    if (total == 0) return;

    final rect = Rect.fromCircle(center: center, radius: radius);
    const startBase = -1.5708;
    double start = startBase;

    void drawArc(double value, Color color) {
      if (value <= 0) return;
      final sweep = (value / total) * 6.2831853;
      final paint = Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.butt;
      canvas.drawArc(rect, start, sweep, false, paint);
      start += sweep;
    }

    drawArc(resolved, const Color(0xFF16A34A));
    drawArc(inProgress, const Color(0xFFD97706));
    drawArc(open, const Color(0xFFEF4444));
  }

  @override
  bool shouldRepaint(covariant GrievanceDonutPainter old) {
    return old.resolved != resolved ||
        old.inProgress != inProgress ||
        old.open != open;
  }
}
