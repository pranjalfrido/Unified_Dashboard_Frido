import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { BigQuery } = require('@google-cloud/bigquery');

const bq = new BigQuery({
  keyFilename: 'c:/Users/PranjalTripati/OneDrive - Arcatron Mobility Pvt Ltd/Desktop/MIS/sa_key.json',
  projectId: 'frido-429506',
});

const TABLE = 'frido-429506.ads_campaign_mapping.master_campaign_mapping_sheet_all_platforms';

// ─── ALL ROWS ────────────────────────────────────────────────────────────────
// FIX applied: "ErgoLuxe Monitor Arm" → "ErgoLuxe Monitor Arm - Single"
// (single-arm campaigns mapped to Single variant; adjust to Dual where needed)

const rows = [
  // ===== AMAZON =====
  {campaign_name:"SB/Heel Protector/CAT/May26/1",platform:"Amazon",product_name:"Heel Protector",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/LumboSacralBelt/Generic/Phrase/Feb25/1",platform:"Amazon",product_name:"Lumbo Sacral Belt",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/ElectricHeatingPad/Generic/Phrase/HS/Jun26/C3",platform:"Amazon",product_name:"Personal Care",category:"Personal Care",target_type:"category"},
  {campaign_name:"SP/ActiveShoes/Generic/Phrase/Men/Jun26/C6",platform:"Amazon",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/LumboSacralBelt/Brand/Phrase/Feb25/1",platform:"Amazon",product_name:"Lumbo Sacral Belt",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/WedgeSandals/CAT/Jun26/C2",platform:"Amazon",product_name:"Women's Arch Support Wedge Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/LumboSacralBelt/CAT/Feb25/1",platform:"Amazon",product_name:"Lumbo Sacral Belt",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/LumboSacralBelt/CompPT/May25/1",platform:"Amazon",product_name:"Lumbo Sacral Belt",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/WedgeSandals/Auto/Jun26/C2",platform:"Amazon",product_name:"Women's Arch Support Wedge Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/LumboSacralBelt/Brand/PT/Feb25/1",platform:"Amazon",product_name:"Lumbo Sacral Belt",category:"Orthotics",target_type:"product"},
  {campaign_name:"SD/ActiveShoes/CAT/VCPM/Jun26/1",platform:"Amazon",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/ActiveShoes/CAT/Jun26/C1",platform:"Amazon",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/ActiveShoes/Generic/Exact/Men/Jun26/C4",platform:"Amazon",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/LumboSacralBelt/Generic/Exact/Feb25/1",platform:"Amazon",product_name:"Lumbo Sacral Belt",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/Slipon-W/Auto/Jun26/C3",platform:"Amazon",product_name:"Women's Arch Comfort Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/CrescentPillow/Brand/Phrase/Jun26/C6",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SP/ActiveShoes/Auto/Jun26/C1",platform:"Amazon",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/LumboSacralBelt/Auto/Feb25/1",platform:"Amazon",product_name:"Lumbo Sacral Belt",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/BlackBarefoot/Brand/PT/April25/1",platform:"Amazon",product_name:"Barefoot Sock Shoe Classic",category:"Footwear",target_type:"product"},
  {campaign_name:"SD/CrescentPillow/CAT/VCPM/Jun26/1",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SD/WedgeSandals/CAT/VCPM/June26",platform:"Amazon",product_name:"Women's Arch Support Wedge Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/CrescentPillow/Generic/Phrase/HS/Jun26/C4",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SD/ElectricHeatingPad/CAT/VCPM/Jun26/1",platform:"Amazon",product_name:"Personal Care",category:"Personal Care",target_type:"category"},
  {campaign_name:"SD/WedgeSandals/VR/AP/VCPM/June26",platform:"Amazon",product_name:"Women's Arch Support Wedge Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/LapDesk Pillow/Phrase/Jan25/1",platform:"Amazon",product_name:"Lap Desk Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SP/ActiveShoes/Generic/Phrase/Women/Jun26/C5",platform:"Amazon",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"SD/ActiveShoes/VR/AP/VCPM/Jun26/1",platform:"Amazon",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/Slipon-W/Generic/Phrase/HS/Jun26/C5",platform:"Amazon",product_name:"Women's Arch Comfort Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/CrescentPillow/Generic/Exact/HS/Jun26/C3",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SD/CrescentPillow/VR/AP/VCPM/Jun26/1",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SP/WedgeSandals/Generic/Phrase/HS/Jun26/C4",platform:"Amazon",product_name:"Women's Arch Support Wedge Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/ElectricHeatingPad/Generic/Exact/HS/Jun26/C2",platform:"Amazon",product_name:"Personal Care",category:"Personal Care",target_type:"category"},
  {campaign_name:"SP/WinterSocks/Auto/Nov25/1",platform:"Amazon",product_name:"Winter Socks",category:"Socks",target_type:"product"},
  // FIX: "ErgoLuxe Monitor Arm" → "ErgoLuxe Monitor Arm - Single"
  {campaign_name:"SP/ArmMonitor/Generic/Phrase/HS/Jun26/C4",platform:"Amazon",product_name:"ErgoLuxe Monitor Arm - Single",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/CrescentPillow/CAT/Jun26/C2",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SD/WedgeSandals/Brand/VCPM/June26",platform:"Amazon",product_name:"Women's Arch Support Wedge Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/WedgeSandals/Brand/Phrase/Jun26/C6",platform:"Amazon",product_name:"Women's Arch Support Wedge Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SD/CrescentPillow/Brand/VCPM/Jun26/1",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SD/WedgeSandals/Comp/VCPM/June26",platform:"Amazon",product_name:"Women's Arch Support Wedge Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/WedgePlus+Covers/Phrase/ST/May26/1",platform:"Amazon",product_name:"Wedge Plus Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"SP/ElectricStandingDesk/Generic/Phrase/HS/Jun26/C4",platform:"Amazon",product_name:"Ergoluxe Electric Standing Desk",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SD/ActiveShoes/Comp/VCPM/Jun26/1",platform:"Amazon",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/ElectricStandingDesk/Auto/Jun26/C2",platform:"Amazon",product_name:"Ergoluxe Electric Standing Desk",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SD/ElectricHeatingPad/VR/AP/VCPM/Jun26/1",platform:"Amazon",product_name:"Personal Care",category:"Personal Care",target_type:"category"},
  {campaign_name:"SP/ElectricStandingDesk/Generic/Exact/HS/Jun26/C3",platform:"Amazon",product_name:"Ergoluxe Electric Standing Desk",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/WedgeSandals/Brand/PT/Jun26/C1",platform:"Amazon",product_name:"Women's Arch Support Wedge Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/NeckMassager/CAT/Jun26/C2",platform:"Amazon",product_name:"Five Finger Neck Massager",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/CrescentPillow/Auto/Jun26/C2",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SP/GlideChair/Phrase/July25/1",platform:"Amazon",product_name:"Glide Ergo chair",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SBV/CrescentPillow/Phrase/Jun26/1",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SD/ElectricStandingDesk/CAT/VCPM/Jun26/1",platform:"Amazon",product_name:"Ergoluxe Electric Standing Desk",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/ActiveShoes/Brand/Phrase/Jun26/C8",platform:"Amazon",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  // FIX: "ErgoLuxe Monitor Arm" → "ErgoLuxe Monitor Arm - Single"
  {campaign_name:"SP/ArmMonitor/CAT/Jun26/C2",platform:"Amazon",product_name:"ErgoLuxe Monitor Arm - Single",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SBV/CrescentPillow/CAT/Jun26/1",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SD/ComfortSandal/CAT/VCPM/Aug25/1",platform:"Amazon",product_name:"Men's Cloud Comfort Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SD/KneePillow/CAT/Sep25/1",platform:"Amazon",product_name:"Knee Pillow",category:"Pillows",target_type:"product"},
  // FIX: "ErgoLuxe Monitor Arm" → "ErgoLuxe Monitor Arm - Single"
  {campaign_name:"SP/ArmMonitor/Auto/Jun26/C2",platform:"Amazon",product_name:"ErgoLuxe Monitor Arm - Single",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SD/WedgePlusColors/RM/AP/Feb25/1",platform:"Amazon",product_name:"Wedge Plus Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"SP/WedgeSandals/Generic/Exact/HS/Jun26/C3",platform:"Amazon",product_name:"Women's Arch Support Wedge Sandals",category:"Footwear",target_type:"product"},
  // FIX: "ErgoLuxe Monitor Arm" → "ErgoLuxe Monitor Arm - Single"
  {campaign_name:"SD/ArmMonitor/CAT/VCPM/Jun26/1",platform:"Amazon",product_name:"ErgoLuxe Monitor Arm - Single",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/Slipon-W/Brand/PT/Jun26/C1",platform:"Amazon",product_name:"Women's Arch Comfort Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/MaternityPillowBundle/Phrase/June25/1",platform:"Amazon",product_name:"Maternity Pillow Plus",category:"Pillows",target_type:"product"},
  {campaign_name:"SP/Slipon-W/Competitor/PT/Jun26/C2",platform:"Amazon",product_name:"Women's Arch Comfort Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SD/StandingDesk/CAT/July25/1",platform:"Amazon",product_name:"Ergoluxe Electric Standing Desk",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/ActiveShoes/Brand/PT/Jun26/C2",platform:"Amazon",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/WedgeSandals/Brand/Exact/Jun26/C5",platform:"Amazon",product_name:"Women's Arch Support Wedge Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/ElectricHeatingPad/Auto/Jun26/C1",platform:"Amazon",product_name:"Personal Care",category:"Personal Care",target_type:"category"},
  {campaign_name:"SP/ComfortSandal/Brand/Phrase/Aug25/1",platform:"Amazon",product_name:"Men's Cloud Comfort Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/CloudSeat/Phrase/June25/1",platform:"Amazon",product_name:"Cloud Seat Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"SP/NeckMassager/Auto/Jun26/C2",platform:"Amazon",product_name:"Five Finger Neck Massager",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/LaceupShoesWomen/Brand/Phrase/Feb26/1",platform:"Amazon",product_name:"Casual Sneakers",category:"Footwear",target_type:"product"},
  {campaign_name:"SD/NeckMassager/CAT/VCPM/Jun26/1",platform:"Amazon",product_name:"Five Finger Neck Massager",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/ActiveShoes/Brand/Exact/Jun26/C7",platform:"Amazon",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"SBV/CrescentPillow/Exact/Jun26/1",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SP/FoldableWalker/Phrase/March25/1",platform:"Amazon",product_name:"Walker",category:"Mobility",target_type:"product"},
  {campaign_name:"SD/EyeMask/RM/AP/July25/1",platform:"Amazon",product_name:"3D Eye Mask",category:"Personal Care",target_type:"product"},
  {campaign_name:"SP/Mask/Ultimate/Brand/Phrase/July22/1",platform:"Amazon",product_name:"Ultimate Pro Face Mask",category:"Mask",target_type:"product"},
  {campaign_name:"SP/ComfortSandal/Auto/Aug25/1",platform:"Amazon",product_name:"Men's Cloud Comfort Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/MattressProtector/Brand/Phrase/Dec25/1",platform:"Amazon",product_name:"Mattress Protector",category:"Covers",target_type:"product"},
  {campaign_name:"SD/ActiveShoes/Brand/VCPM/Jun26/1",platform:"Amazon",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/LaceupShoesWomen/Brand/Exact/Feb26/1",platform:"Amazon",product_name:"Casual Sneakers",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/NeckMassager/Generic/Phrase/HS/Jun26/C5",platform:"Amazon",product_name:"Five Finger Neck Massager",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/CrescentPillow/Brand/PT/Jun26/C1",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SP/ElectricStandingDesk/Brand/Exact/Jun26/C5",platform:"Amazon",product_name:"Ergoluxe Electric Standing Desk",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/OrthopedicArchSupportInsoles/Phrase/April25/1",platform:"Amazon",product_name:"Arch Support Insole",category:"Insoles",target_type:"product"},
  {campaign_name:"SD/CrescentPillow/Comp/VCPM/Jun26/1",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SP/Slipon-W/Generic/Exact/HS/Jun26/C4",platform:"Amazon",product_name:"Women's Arch Comfort Sandals",category:"Footwear",target_type:"product"},
  // FIX: "ErgoLuxe Monitor Arm" → "ErgoLuxe Monitor Arm - Single"
  {campaign_name:"SD/ArmMonitor/VR/AP/VCPM/Jun26/1",platform:"Amazon",product_name:"ErgoLuxe Monitor Arm - Single",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/Mask/Ultimate/Kids/Brand/Phrase/July22/1",platform:"Amazon",product_name:"Ultimate Pro Face Mask",category:"Mask",target_type:"product"},
  {campaign_name:"SP/ElectricHeatingPad/Brand/Exact/Jun26/C4",platform:"Amazon",product_name:"Personal Care",category:"Personal Care",target_type:"category"},
  {campaign_name:"SD/ElectricStandingDesk/Comp/VCPM/Jun26/1",platform:"Amazon",product_name:"Ergoluxe Electric Standing Desk",category:"Ergo Furniture",target_type:"product"},
  // FIX: "ErgoLuxe Monitor Arm" → "ErgoLuxe Monitor Arm - Single"
  {campaign_name:"SP/ArmMonitor/Generic/Exact/HS/Jun26/C3",platform:"Amazon",product_name:"ErgoLuxe Monitor Arm - Single",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SD/ElectricStandingDesk/VR/AP/VCPM/Jun26/1",platform:"Amazon",product_name:"Ergoluxe Electric Standing Desk",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/LaceupShoesWomen/Generic/Phrase/HS/Feb26/1",platform:"Amazon",product_name:"Casual Sneakers",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/ElectricHeatingPad/Brand/Phrase/Jun26/C5",platform:"Amazon",product_name:"Personal Care",category:"Personal Care",target_type:"category"},
  {campaign_name:"SD/WedgeNeckCombo/RM/AP/July25/1",platform:"Amazon",product_name:"Cloud Seating Combo",category:"Combo",target_type:"product"},
  {campaign_name:"SP/LaceupShoesWomen/Generic/Phrase/LS/Feb26/3",platform:"Amazon",product_name:"Casual Sneakers",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/BarefootClassic/Auto/March25/1",platform:"Amazon",product_name:"Barefoot Sock Shoe Classic",category:"Footwear",target_type:"product"},
  {campaign_name:"SD/NeckMassager/Comp/VCPM/Jun26/1",platform:"Amazon",product_name:"Five Finger Neck Massager",category:"Orthotics",target_type:"product"},
  // FIX: "ErgoLuxe Monitor Arm" → "ErgoLuxe Monitor Arm - Single"
  {campaign_name:"SP/ArmMonitor/Brand/Phrase/Jun26/C6",platform:"Amazon",product_name:"ErgoLuxe Monitor Arm - Single",category:"Ergo Furniture",target_type:"product"},
  // FIX: "ErgoLuxe Monitor Arm" → "ErgoLuxe Monitor Arm - Single"
  {campaign_name:"SD/ArmMonitor/Comp/VCPM/Jun26/1",platform:"Amazon",product_name:"ErgoLuxe Monitor Arm - Single",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SD/NeckMassager/VR/AP/VCPM/Jun26/1",platform:"Amazon",product_name:"Five Finger Neck Massager",category:"Orthotics",target_type:"product"},
  {campaign_name:"SD/ElectricHeatingPad/Comp/VCPM/Jun26/1",platform:"Amazon",product_name:"Personal Care",category:"Personal Care",target_type:"category"},
  {campaign_name:"SP/NeckMassager/Brand/Phrase/Jun26/C7",platform:"Amazon",product_name:"Five Finger Neck Massager",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/BarefootClassic/WoMen/Exact/March25/1",platform:"Amazon",product_name:"Barefoot Sock Shoe Classic",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/NeckMassager/Brand/Exact/Jun26/C6",platform:"Amazon",product_name:"Five Finger Neck Massager",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/Car Wedge/Auto/Oct24/1",platform:"Amazon",product_name:"Car Wedge Seat Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"SP/MassageChair/Phrase/May25/1",platform:"Amazon",product_name:"Aeroluxe Massage Chair",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/BlackBarefootClassic/Phrase/April25/1",platform:"Amazon",product_name:"Barefoot Sock Shoe Classic",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/BunionCorrector/Exact/June25/1",platform:"Amazon",product_name:"Bunion Corrector",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/SleepPlusPillow/Phrase/June25/1",platform:"Amazon",product_name:"Deep Sleep Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SP/LegCover/Phrase/Sep25/1",platform:"Amazon",product_name:"Mattress Protector",category:"Covers",target_type:"product"},
  {campaign_name:"SP/CuddlePillow/Phrase/Feb25/1",platform:"Amazon",product_name:"Cuddle Pillow",category:"Pillows",target_type:"product"},
  // FIX: "ErgoLuxe Monitor Arm" → "ErgoLuxe Monitor Arm - Single"
  {campaign_name:"SBV/ArmMonitor/CAT/Jun26/1",platform:"Amazon",product_name:"ErgoLuxe Monitor Arm - Single",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/FlipUpGrabBar/Phrase/Nov25/1",platform:"Amazon",product_name:"Mobility",category:"Mobility",target_type:"category"},
  {campaign_name:"SP/ArmCover/Auto/Sep25/1",platform:"Amazon",product_name:"Mattress Protector",category:"Covers",target_type:"product"},
  {campaign_name:"SP/ComfortSlippers/Exact/Men/Sep25/1",platform:"Amazon",product_name:"Men's Cloud Comfort Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/LaceupShoesWomen/Auto/Feb26/1",platform:"Amazon",product_name:"Casual Sneakers",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/ToeRingSandals/Phrase/Sep25/1",platform:"Amazon",product_name:"Men's Toe Ring Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/NeckMassager/Competitor/PT/Jun26/C3",platform:"Amazon",product_name:"Five Finger Neck Massager",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/ElectricStandingDesk/Brand/PT/Jun26/C1",platform:"Amazon",product_name:"Ergoluxe Electric Standing Desk",category:"Ergo Furniture",target_type:"product"},
  // FIX: "ErgoLuxe Monitor Arm" → "ErgoLuxe Monitor Arm - Single"
  {campaign_name:"SBV/ArmMonitor/Phrase/Jun26/1",platform:"Amazon",product_name:"ErgoLuxe Monitor Arm - Single",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/LaceupShoesWomen/Generic/Exact/HS/Feb26/1",platform:"Amazon",product_name:"Casual Sneakers",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/LaceupShoesWomen/Generic/Exact/LS/Feb26/1",platform:"Amazon",product_name:"Casual Sneakers",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/Bestseller/Auto/Jan26/1",platform:"Amazon",product_name:"Combo",category:"Combo",target_type:"category"},
  {campaign_name:"SP/CrescentPillow/Brand/Exact/Jun26/C5",platform:"Amazon",product_name:"Crescent Adjustable Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"SD/NeckMassager/Brand/VCPM/Jun26/1",platform:"Amazon",product_name:"Five Finger Neck Massager",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/ActiveShoes/Generic/Exact/Women/Jun26/C3",platform:"Amazon",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/LumboSacralBelt/Brand/Exact/Feb25/1",platform:"Amazon",product_name:"Lumbo Sacral Belt",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/FootCover/Auto/Sep25/1",platform:"Amazon",product_name:"Mattress Protector",category:"Covers",target_type:"product"},
  {campaign_name:"SP/LaceupShoes/Phrase/Sep25/1",platform:"Amazon",product_name:"Casual Sneakers",category:"Footwear",target_type:"product"},
  {campaign_name:"SD/Car Backrest Pillow/RM/AP/VCPM/Apr24/1",platform:"Amazon",product_name:"Car Backrest Cushion",category:"Cushions",target_type:"product"},
  // FIX: "ErgoLuxe Monitor Arm" → "ErgoLuxe Monitor Arm - Single"
  {campaign_name:"SBV/ArmMonitor/Exact/Jun26/1",platform:"Amazon",product_name:"ErgoLuxe Monitor Arm - Single",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/LegCover/Exact/Sep25/1",platform:"Amazon",product_name:"Mattress Protector",category:"Covers",target_type:"product"},
  {campaign_name:"SP/CloudSeat/Brand/Phrase/June25/1",platform:"Amazon",product_name:"Cloud Seat Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"SD/Car Backrest Pillow/VCPM/COMP/Apr24/1",platform:"Amazon",product_name:"Car Backrest Cushion",category:"Cushions",target_type:"product"},
  // FIX: "ErgoLuxe Monitor Arm" → "ErgoLuxe Monitor Arm - Single"
  {campaign_name:"SP/ArmMonitor/Brand/Exact/Jun26/C5",platform:"Amazon",product_name:"ErgoLuxe Monitor Arm - Single",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/ElectricStandingDesk/Brand/Phrase/Jun26/C6",platform:"Amazon",product_name:"Ergoluxe Electric Standing Desk",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"SP/TransferChair/Phrase/Aug25/1",platform:"Amazon",product_name:"Transfer Lift",category:"Mobility",target_type:"product"},
  {campaign_name:"SP/NeckMassager/Generic/Exact/HS/Jun26/C4",platform:"Amazon",product_name:"Five Finger Neck Massager",category:"Orthotics",target_type:"product"},
  {campaign_name:"SP/Commode Chair/CAT/PT/Apr23/1",platform:"Amazon",product_name:"Mobility",category:"Mobility",target_type:"category"},
  {campaign_name:"SP/LaceupShoesWomen/Generic/Phrase/MS/Feb26/2",platform:"Amazon",product_name:"Casual Sneakers",category:"Footwear",target_type:"product"},
  {campaign_name:"SP/CloudBackrest/Phrase/May25/1",platform:"Amazon",product_name:"Cloud Backrest Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"SD/LumboSacralBelt/CompPT/May25/1",platform:"Amazon",product_name:"Lumbo Sacral Belt",category:"Orthotics",target_type:"product"},

  // ===== BLINKIT =====
  {campaign_name:"LS/WedgeCushions/KW/Generic/FathersDay",platform:"Blinkit",product_name:"Wedge Cushion",category:"Cushions",target_type:"product"},

  // ===== FLIPKART =====
  {campaign_name:"PCA_SPOTLIGHT_CAR COMBO_July26",platform:"Flipkart",product_name:"Car Comfort Bundle",category:"Combo",target_type:"product"},
  {campaign_name:"PLA_Footwear_Cloud Comfort Sandal-M_Branded_June26",platform:"Flipkart",product_name:"Men's Cloud Comfort Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"PLA_Footwear_Slip On Casual Shoes_Genric_M_Feb26",platform:"Flipkart",product_name:"Casual Sneakers",category:"Footwear",target_type:"product"},
  {campaign_name:"PLA_Chair_Ergoluxe Chair_Genric_May26",platform:"Flipkart",product_name:"Glide Ergo chair",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"PLA_Car Accessories_Car Backrest Pillow_Genric_June26",platform:"Flipkart",product_name:"Car Backrest Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"PLA_Footwear_Slip On Casual Shoes_Branded_M_Feb26",platform:"Flipkart",product_name:"Casual Sneakers",category:"Footwear",target_type:"product"},
  {campaign_name:"PLA_Car Accessories_Car Backrest Pillow_Auto_June26",platform:"Flipkart",product_name:"Car Backrest Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"PLA_Cushions_Car Neck Rest_New_Auto_June26",platform:"Flipkart",product_name:"Car Neck Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"PLA_Cushions_Car Wedge Seat Cushions _Auto_June26",platform:"Flipkart",product_name:"Car Wedge Seat Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"PLA_Footwear_Slip On Casual Shoes_Comp_M_Feb26",platform:"Flipkart",product_name:"Casual Sneakers",category:"Footwear",target_type:"product"},
  {campaign_name:"PLA_Cushions_Ultimate Pro Seat Cushion_Auto_June26",platform:"Flipkart",product_name:"Pro Seat Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"PLA_Cushions_Car Neck Rest_New_genric_June26",platform:"Flipkart",product_name:"Car Neck Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"PLA_Footwear_Slip On Casual Shoes_Auto_M_April26",platform:"Flipkart",product_name:"Casual Sneakers",category:"Footwear",target_type:"product"},
  {campaign_name:"PLA_Cushions_Cloud Seat Cushion_Auto_June26",platform:"Flipkart",product_name:"Cloud Seat Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"PLA_Cushions_Cloud Backrest_Auto_June26",platform:"Flipkart",product_name:"Cloud Backrest Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"PLA_Cushions_Wedge Plus Cushion Cooling_Auto_June26",platform:"Flipkart",product_name:"Wedge Plus Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"PLA_Chair_Ergoluxe Chair_Branded_June6",platform:"Flipkart",product_name:"Glide Ergo chair",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"PLA_Cushions_Wedge Neck Combo_Genric_June26",platform:"Flipkart",product_name:"Cozy Wedge Combo",category:"Combo",target_type:"product"},
  {campaign_name:"PLA_Cushions_Wedge Max Cushion_Genric_June26",platform:"Flipkart",product_name:"Wedge Plus Max Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"PLA_Orthotics_KT tape_Auto_June26",platform:"Flipkart",product_name:"Kinesiology Tape",category:"Orthotics",target_type:"product"},
  {campaign_name:"PLA_Cushions_Sofa Backrest Cushion_Auto_June26",platform:"Flipkart",product_name:"Sofa Backrest Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"PLA_Cushions_Wedge Neck Combo_Branded_June26",platform:"Flipkart",product_name:"Cozy Wedge Combo",category:"Combo",target_type:"product"},
  {campaign_name:"PLA_Cushions_Tailbone Relief Cushion_Auto_June26",platform:"Flipkart",product_name:"Tailbone Pain Relief Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"PLA_Car Accessories_Car Combo_New_Comp_June26",platform:"Flipkart",product_name:"Car Comfort Bundle",category:"Combo",target_type:"product"},
  {campaign_name:"PLA_Cushions_Coccyx Seat Cushion_Genric_June26",platform:"Flipkart",product_name:"Coccyx Seat Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"PLA_Cushions_Coccyx Seat Cushion_Branded_June26",platform:"Flipkart",product_name:"Coccyx Seat Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"100PLA_Car Accessories_Car Backrest Pillow_Branded_June26",platform:"Flipkart",product_name:"Car Backrest Cushion",category:"Cushions",target_type:"product"},

  // ===== META =====
  {campaign_name:"ABO__PostureCorrectorPro-VideoAds-Regional__25062026",platform:"Meta",product_name:"Posture Corrector",category:"Orthotics",target_type:"product"},
  {campaign_name:"ABO__MaternityPillowBundlePlus__VideoAds__25032026",platform:"Meta",product_name:"Maternity Pillow Plus",category:"Pillows",target_type:"product"},
  {campaign_name:"ASC__FiveToeSocks-VideoAds__20062026",platform:"Meta",product_name:"Five Toe Socks",category:"Socks",target_type:"product"},
  {campaign_name:"ABO__DOD-AllProducts-VideoAds__01072026",platform:"Meta",product_name:"Combo",category:"Combo",target_type:"category"},
  {campaign_name:"ABO__PostureCorrectorPro__StaticAds__17062026",platform:"Meta",product_name:"Posture Corrector",category:"Orthotics",target_type:"product"},
  {campaign_name:"ABO__CarCombo-VideoAds-Regional__26062026",platform:"Meta",product_name:"Car Comfort Bundle",category:"Combo",target_type:"product"},
  {campaign_name:"ABO__CarNeckPillow-VideoAds-Regional__26062026",platform:"Meta",product_name:"Car Neck Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"ABO__PuneriArchComfortSandalMens-VideoAds__20062026",platform:"Meta",product_name:"Men's Puneri Chappal",category:"Footwear",target_type:"product"},
  {campaign_name:"ABO__LanguageTesting-VideoAds__22062026",platform:"Meta",product_name:"Combo",category:"Combo",target_type:"category"},
  {campaign_name:"ABO__WomensArchSupportWedgeSandalsAdjustableStrap-StaticAds__30062026",platform:"Meta",product_name:"Women's Arch Support Wedge Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"ASC__Test4-Cold&HotTherapyCap-VideoAds__27062026",platform:"Meta",product_name:"Cold & Hot Therapy Cap",category:"Personal Care",target_type:"product"},
  {campaign_name:"ASC__Test1-Cold&HotTherapyCap-VideoAds__27062026",platform:"Meta",product_name:"Cold & Hot Therapy Cap",category:"Personal Care",target_type:"product"},
  {campaign_name:"ASC__Test3-Cold&HotTherapyCap-VideoAds__27062026",platform:"Meta",product_name:"Cold & Hot Therapy Cap",category:"Personal Care",target_type:"product"},
  {campaign_name:"ASC__Test2-Cold&HotTherapyCap-VideoAds__27062026",platform:"Meta",product_name:"Cold & Hot Therapy Cap",category:"Personal Care",target_type:"product"},
  {campaign_name:"CBO__MaternityPillowBundlePlus-VideoAds-Regional__25062026",platform:"Meta",product_name:"Maternity Pillow Plus",category:"Pillows",target_type:"product"},
  {campaign_name:"ABO__WedgeCarCushion-VideoAds-Regional__25062026",platform:"Meta",product_name:"Car Wedge Seat Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"ASC__Test2-MensComfortDualStrapSandal-VideoAds__29062026",platform:"Meta",product_name:"Men's Comfort Dual Strap Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"ABO__CarBackRest-VideoAds-Regional__26062026",platform:"Meta",product_name:"Car Backrest Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"CBO__Orthotics-KneeSupportWrap-VideoAds-Regional__25062026",platform:"Meta",product_name:"Knee Wrap",category:"Orthotics",target_type:"product"},
  {campaign_name:"ABO__MaternityPillowBundlePlus-VideoAds-Regional__07072026",platform:"Meta",product_name:"Maternity Pillow Plus",category:"Pillows",target_type:"product"},
  {campaign_name:"ABO__ComfortFormalShoes-VideoAds-Regional__07072026",platform:"Meta",product_name:"Formal Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"ASC__Test1-MensComfortDualStrapSandal-VideoAds__29062026",platform:"Meta",product_name:"Men's Comfort Dual Strap Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"ASC__Test2-UnisexCloudComfortArchSupportSlippers-VideoAds__29062026",platform:"Meta",product_name:"Arch Support Slippers",category:"Footwear",target_type:"product"},
  {campaign_name:"ASC__Test1-UnisexCloudComfortArchSupportSlippers-VideoAds__29062026",platform:"Meta",product_name:"Arch Support Slippers",category:"Footwear",target_type:"product"},
  {campaign_name:"ABO__TravelNeckPillow__StaticAds__17062026",platform:"Meta",product_name:"Travel Neck Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"ASC__Test1-LSBelt-VideoAds__30062026",platform:"Meta",product_name:"Lumbo Sacral Belt",category:"Orthotics",target_type:"product"},
  {campaign_name:"ASC__Test2-LSBelt-VideoAds__30062026",platform:"Meta",product_name:"Lumbo Sacral Belt",category:"Orthotics",target_type:"product"},
  {campaign_name:"ABO__AllFootwear-VideoAds-Regional__08072026",platform:"Meta",product_name:"Footwear",category:"Footwear",target_type:"category"},
  {campaign_name:"ABO__TGIF-AllAds__02072026",platform:"Meta",product_name:"Combo",category:"Combo",target_type:"category"},
  {campaign_name:"ASC__Test3-UnisexCloudComfortArchSupportSlippers-VideoAds__29062026",platform:"Meta",product_name:"Arch Support Slippers",category:"Footwear",target_type:"product"},
  {campaign_name:"ASC__Test3-MensComfortDualStrapSandal-VideoAds__29062026",platform:"Meta",product_name:"Men's Comfort Dual Strap Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"ABO__LSBelt-VideoAds-Regional__07072026",platform:"Meta",product_name:"Lumbo Sacral Belt",category:"Orthotics",target_type:"product"},
  {campaign_name:"CBO__ErgoChair-VideoAds-Regional__07072026",platform:"Meta",product_name:"Glide Ergo chair",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"ASC__Test3-LSBelt-VideoAds__30062026",platform:"Meta",product_name:"Lumbo Sacral Belt",category:"Orthotics",target_type:"product"},
  {campaign_name:"ASC__Test1-Orthotics-HeelProtector-VideoAds__30062026",platform:"Meta",product_name:"Heel Protector",category:"Orthotics",target_type:"product"},
  {campaign_name:"ABO__NasalStripsPro-AllAds-Priyanka__30062026",platform:"Meta",product_name:"Nasal Strip",category:"Personal Care",target_type:"product"},
  {campaign_name:"ASC__Test3-Orthotics-HeelProtector-VideoAds__30062026",platform:"Meta",product_name:"Heel Protector",category:"Orthotics",target_type:"product"},
  {campaign_name:"ABO__Carousel-All_Products-Mix__22062026",platform:"Meta",product_name:"Combo",category:"Combo",target_type:"category"},
  {campaign_name:"ABO__PlantarFasciitisInsoles-VideoAds-Regional__07072026",platform:"Meta",product_name:"Plantar Fasciitis Insole",category:"Insoles",target_type:"product"},
  {campaign_name:"CBO__StandingDesk-VideoAds-Regional__07072026",platform:"Meta",product_name:"Ergoluxe Electric Standing Desk",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"ABO__CloudBackrestCushion-Video__04072026",platform:"Meta",product_name:"Cloud Backrest Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"ASC__Test2-Orthotics-HeelProtector-VideoAds__30062026",platform:"Meta",product_name:"Heel Protector",category:"Orthotics",target_type:"product"},
  {campaign_name:"CBO__FiveToeSocks-VideoAds__27062026",platform:"Meta",product_name:"Five Toe Socks",category:"Socks",target_type:"product"},
  {campaign_name:"ASC__UnisexCloudComfortArchSupportSlippers-Tushar__07072026",platform:"Meta",product_name:"Arch Support Slippers",category:"Footwear",target_type:"product"},
  {campaign_name:"ABO__StandingDesk-VideoAds__07072026",platform:"Meta",product_name:"Ergoluxe Electric Standing Desk",category:"Ergo Furniture",target_type:"product"},
  {campaign_name:"ASC__PostureCorrectorPro-StaticAds-Test1__22062026",platform:"Meta",product_name:"Posture Corrector",category:"Orthotics",target_type:"product"},

  // ===== MYNTRA =====
  {campaign_name:"PLA_SpecialityPillow_ContourCervical Pillow_Generic_June26",platform:"Myntra",product_name:"Contour Cervical Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"PLA_Insole_DualGelInsole_Auto_June26",platform:"Myntra",product_name:"Dual Gel Pro Insoles",category:"Insoles",target_type:"product"},
  {campaign_name:"PLA_Footwear_Women's Arch_Wedges_Generic_June26",platform:"Myntra",product_name:"Women's Arch Support Wedge Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"PLA_Footwear_Puneri Arch Sandal_Generic_June26",platform:"Myntra",product_name:"Puneri Arch Comfort Sandal",category:"Footwear",target_type:"product"},
  {campaign_name:"PLA_Maternity U-Shaped Pillow_Generic_June26",platform:"Myntra",product_name:"Maternity Pillow Plus",category:"Pillows",target_type:"product"},
  {campaign_name:"PLA_Footwear_Active Walking shoes-M_Generic_June26",platform:"Myntra",product_name:"Men's Walking Shoes",category:"Footwear",target_type:"product"},
  {campaign_name:"PLA_Footwear_Men Cloud Comfort Sandal_Brand_June26",platform:"Myntra",product_name:"Men's Cloud Comfort Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"PLA_Maternity U-Shaped Pillow_Auto_July26",platform:"Myntra",product_name:"Maternity Pillow Plus",category:"Pillows",target_type:"product"},
  {campaign_name:"PLA_Pillow_SleepingPillow_Generic_June26",platform:"Myntra",product_name:"Deep Sleep Pillow",category:"Pillows",target_type:"product"},
  {campaign_name:"PLA_Orthotics_Heel_Protector_Generic_June26",platform:"Myntra",product_name:"Heel Protector",category:"Orthotics",target_type:"product"},
  {campaign_name:"PLA_Footwear_Puneri Chappal Men_Brand_June26",platform:"Myntra",product_name:"Men's Puneri Chappal",category:"Footwear",target_type:"product"},
  {campaign_name:"PLA_Footwear_Cloud Comfort Sandal Toe Ring_Brand_June26",platform:"Myntra",product_name:"Men's Toe Ring Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"PLA_Footwear_Women Casual Shoes_Brand_June26",platform:"Myntra",product_name:"Women's Arch Comfort Sandals",category:"Footwear",target_type:"product"},
  {campaign_name:"PLA_Orthotics_Heel_Protector_Branded_June26",platform:"Myntra",product_name:"Heel Protector",category:"Orthotics",target_type:"product"},
  {campaign_name:"PLA_CarCombo_UltimateSeatCushion_Generic_June26",platform:"Myntra",product_name:"Pro Seat Cushion",category:"Cushions",target_type:"product"},
  {campaign_name:"PLA_Insole_PlantarFasciitisInsoles_Generic_June26",platform:"Myntra",product_name:"Plantar Fasciitis Insole",category:"Insoles",target_type:"product"},
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function escape(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Total rows to sync: ${rows.length}`);

  // Collect unique campaign names for the DELETE step
  const campaignNames = [...new Set(rows.map(r => r.campaign_name))];
  console.log(`Unique campaign names: ${campaignNames.length}`);

  // DELETE existing rows in batches of 200 names
  console.log('\n--- Deleting existing rows ---');
  const deleteChunks = chunkArray(campaignNames, 200);
  for (let i = 0; i < deleteChunks.length; i++) {
    const names = deleteChunks[i].map(n => `'${escape(n)}'`).join(', ');
    const deleteSql = `DELETE FROM \`${TABLE}\` WHERE campaign_name IN (${names})`;
    await bq.query({ query: deleteSql });
    console.log(`  Deleted batch ${i + 1}/${deleteChunks.length} (${deleteChunks[i].length} names)`);
  }
  console.log('Delete complete.');

  // INSERT in batches of 50
  console.log('\n--- Inserting rows ---');
  const insertChunks = chunkArray(rows, 50);
  let totalInserted = 0;

  for (let i = 0; i < insertChunks.length; i++) {
    const chunk = insertChunks[i];
    const valueRows = chunk.map(r =>
      `('${escape(r.campaign_name)}', '${escape(r.platform)}', '${escape(r.product_name)}', '${escape(r.category)}', '${escape(r.target_type)}')`
    ).join(',\n  ');

    const insertSql = `
INSERT INTO \`${TABLE}\`
  (campaign_name, platform, product_name, category, target_type)
VALUES
  ${valueRows}
`;
    await bq.query({ query: insertSql });
    totalInserted += chunk.length;
    console.log(`  Inserted batch ${i + 1}/${insertChunks.length} — ${totalInserted}/${rows.length} rows done`);
  }

  console.log(`\nSUCCESS: ${totalInserted} rows inserted into ${TABLE}`);

  // Summary of ErgoLuxe Monitor Arm fixes applied
  const fixedRows = rows.filter(r => r.product_name === 'ErgoLuxe Monitor Arm - Single');
  console.log(`\nFIX APPLIED: ${fixedRows.length} campaigns had "ErgoLuxe Monitor Arm" corrected to "ErgoLuxe Monitor Arm - Single":`);
  fixedRows.forEach(r => console.log(`  [${r.platform}] ${r.campaign_name}`));
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
