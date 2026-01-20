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

    print('🧠 SM-2 Input: quality=$quality, reps=$repetitions, interval=$interval');

    // Update ease factor based on quality
    if (quality >= 3) {
      // Correct response
      newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      newEaseFactor = newEaseFactor.clamp(1.3, 2.5);

      // ✅ MODIFIED: Respect button choice from first review
      if (repetitions == 0) {
        // First review - button dependent
        switch (quality) {
          case 3: // Good
            newInterval = 1;
            break;
          case 4: // Easy
            newInterval = 4;
            break;
          case 5: // Very Easy
            newInterval = 7;
            break;
          default:
            newInterval = 1;
        }
        print('   First review: quality=$quality → $newInterval days');
      } else if (repetitions == 1) {
        // Second review - button dependent
        switch (quality) {
          case 3: // Good
            newInterval = 6;
            break;
          case 4: // Easy
            newInterval = 14;
            break;
          case 5: // Very Easy
            newInterval = 30;
            break;
          default:
            newInterval = 6;
        }
        print('   Second review: quality=$quality → $newInterval days');
      } else {
        // Third+ review - use SM-2 formula
        newInterval = (interval * newEaseFactor).round();
        
        // Boost for Easy button
        if (quality == 5) {
          newInterval = (newInterval * 1.5).round();
        } else if (quality == 4) {
          newInterval = (newInterval * 1.2).round();
        }
        print('   Later review: formula → $newInterval days');
      }
      
      newRepetitions = repetitions + 1;
    } else {
      // Incorrect response - reset
      newRepetitions = 0;
      newInterval = 1;
      print('   Failed: Reset to 1 day');
    }

    final nextReviewDate = DateTime.now().add(Duration(days: newInterval));

    print('✅ SM-2 Output: interval=$newInterval days, reps=$newRepetitions');
    print('   Next review: ${nextReviewDate.toString().split(' ')[0]}');

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
