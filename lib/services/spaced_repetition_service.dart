class SpacedRepetitionService {
  // Modified SM-2 Algorithm - Respects button choice from first review
  static Map<String, dynamic> calculateNextReview({
    required int quality, // 0-5: 0=Again, 1-2=Hard, 3=Good, 4-5=Easy
    required double easeFactor,
    required int interval,
    required int repetitions,
  }) {
    double newEaseFactor = easeFactor;
    int newInterval = interval;
    int newRepetitions = repetitions;

    if (quality >= 3) {
      // Correct response
      newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      newEaseFactor = newEaseFactor.clamp(1.3, 2.5);

      if (repetitions == 0) {
        switch (quality) {
          case 3:
            newInterval = 1;
            break;
          case 4:
            newInterval = 4;
            break;
          case 5:
            newInterval = 7;
            break;
          default:
            newInterval = 1;
        }
      } else if (repetitions == 1) {
        switch (quality) {
          case 3:
            newInterval = 6;
            break;
          case 4:
            newInterval = 14;
            break;
          case 5:
            newInterval = 30;
            break;
          default:
            newInterval = 6;
        }
      } else {
        newInterval = (interval * newEaseFactor).round();
        if (quality == 5) {
          newInterval = (newInterval * 1.5).round();
        } else if (quality == 4) {
          newInterval = (newInterval * 1.2).round();
        }
      }

      newRepetitions = repetitions + 1;
    } else {
      newRepetitions = 0;
      newInterval = 1;
    }

    final nextReviewDate = DateTime.now().add(Duration(days: newInterval));

    return {
      'easeFactor': newEaseFactor,
      'interval': newInterval,
      'repetitions': newRepetitions,
      'nextReviewDate': nextReviewDate.toIso8601String(),
    };
  }

  // Convert button press to quality rating
  static int buttonToQuality(String button) {
    switch (button) {
      case 'again':
        return 0;
      case 'hard':
        return 2;
      case 'good':
        return 3;
      case 'easy':
        return 5;
      default:
        return 3;
    }
  }

  // Get interval display text
  static String getIntervalText(int days) {
    if (days < 1) return '<1d';
    if (days == 1) return '1 day';
    if (days < 7) return '$days days';
    if (days < 30) {
      final weeks = (days / 7).round();
      return '$weeks ${weeks == 1 ? "week" : "weeks"}';
    }
    if (days < 365) {
      final months = (days / 30).round();
      return '$months ${months == 1 ? "month" : "months"}';
    }
    final years = (days / 365).round();
    return '$years ${years == 1 ? "year" : "years"}';
  }
}
