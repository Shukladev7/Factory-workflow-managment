import React, { useState, useEffect } from "react"

const workShlokas = [
  {
    shlok: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन ।",
    meaning: "You are entitled to your work, not to its fruits — focus on doing your duty with excellence.",
  },
  {
    shlok: "योग: कर्मसु कौशलम् ।",
    meaning: "Perfection in work is true yoga — skill, focus, and balance define efficiency.",
  },
  {
    shlok: "उद्योगिनं पुरुषसिंहमुपैति लक्ष्मीः ।",
    meaning: "Goddess Lakshmi (prosperity) favors those who are industrious and active.",
  },
  {
    shlok: "कर्मणा जायते सिद्धिः।",
    meaning: "Success is born out of hard and consistent work.",
  },
  {
    shlok: "न हि सुप्तस्य सिंहस्य प्रविशन्ति मुखे मृगाः ।",
    meaning: "Even a lion must rise and work — success doesn’t come to those who remain idle.",
  },
  {
    shlok: "श्रम एव जयते।",
    meaning: "Only hard work brings victory.",
  },
  {
    shlok: "संगच्छध्वं संवदध्वं सं वो मनांसि जानताम् ।",
    meaning: "Move together, speak together, and let your minds be one — teamwork leads to harmony and success.",
  },
  {
    shlok: "उद्यमेन हि सिद्ध्यन्ति कार्याणि न मनोरथैः ।",
    meaning: "Goals are achieved through effort, not mere desire or wishful thinking.",
  },
  {
    shlok: "कायेन वाचा मनसा कर्मणा।",
    meaning: "Put your body, speech, mind, and actions in harmony while performing your work.",
  },
  {
    shlok: "कालो न याति निर्विण्णं उद्योगं पुरुषर्षभ।",
    meaning: "Time does not waste those who stay diligent and industrious.",
  },
]

export function MotivationalQuote() {
  const [quote, setQuote] = useState(null)

  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * workShlokas.length)
    setQuote(workShlokas[randomIndex])
  }, [])

  if (!quote) return null

  return (
    <div className="w-full text-center text-sm text-muted-foreground py-4 mt-8 mb-4 border-t">
      <p className="text-base font-semibold text-foreground mb-1">{quote.shlok}</p>
      <p className="text-xs text-muted-foreground">{quote.meaning}</p>
    </div>
  )
}
